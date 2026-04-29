const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLsYHGO0lvQdxVywXS-F7io9Vw2bhpADxTI4nfuf0PdoZh4hVwKPKS0iKTmKycX2WsldvuPur2e58O/pub?output=csv";

let globalData = [];
let simulation, svg, g, zoomObj;
let currentView = 'force'; 
let activeNodeId = null;

d3.csv(SHEET_URL).then(data => {
    globalData = data.map(d => ({
        id: String(d.id),
        name: d.name,
        photo: d.photo || "",
        birth: d.birth || "",
        death: d.death || "",
        phone: d.phone || "",
        fatherId: (d.father_id && d.father_id !== "0") ? String(d.father_id) : null
    }));
    init();
});

function init() {
    svg = d3.select("#treeCanvas")
            .attr("width", window.innerWidth)
            .attr("height", window.innerHeight);
    
    g = svg.append("g");
    
    zoomObj = d3.zoom()
        .scaleExtent([0.05, 3])
        .on("zoom", (e) => g.attr("transform", e.transform));
    
    svg.call(zoomObj);
    
    window.addEventListener('resize', () => {
        svg.attr("width", window.innerWidth).attr("height", window.innerHeight);
    });

    render();
    setupInterface();
}

function render() {
    if (simulation) simulation.stop();
    g.selectAll("*").remove();
    
    const linksData = globalData
        .filter(d => d.fatherId && globalData.find(f => f.id === d.fatherId))
        .map(d => ({ source: d.fatherId, target: d.id }));

    if (currentView === 'force') {
        simulation = d3.forceSimulation(globalData)
            .force("link", d3.forceLink(linksData).id(d => d.id).distance(160))
            .force("charge", d3.forceManyBody().strength(-1200))
            .force("center", d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2))
            .force("collision", d3.forceCollide().radius(80))
            .on("tick", ticked);
            
        drawGraph(globalData, linksData);
    } else {
        // Режим Дерева (Иерархия)
        const stratify = d3.stratify().id(d => d.id).parentId(d => d.fatherId);
        const root = stratify(globalData);
        
        // Настройка размера дерева: ширина между узлами и высота между уровнями
        const treeLayout = d3.tree().nodeSize([200, 250]);
        treeLayout(root);

        const nodes = root.descendants().map(d => {
            // Центрируем дерево: x + половина экрана, y + отступ сверху
            d.x = d.x + window.innerWidth / 2;
            d.y = d.y + 150;
            return Object.assign(d.data, { x: d.x, y: d.y });
        });

        const links = root.links().map(l => ({
            source: { id: l.source.id, x: l.source.x, y: l.source.y },
            target: { id: l.target.id, x: l.target.x, y: l.target.y }
        }));

        drawGraph(nodes, links);
        ticked(); // Отрисовка позиций сразу
        
        // Авто-фокус на корень при переключении
        svg.transition().duration(750).call(zoomObj.transform, d3.zoomIdentity.translate(0, 0).scale(0.8));
    }
}

function drawGraph(nodes, links) {
    const linkContainer = g.append("g").attr("class", "links-layer");
    const nodeContainer = g.append("g").attr("class", "nodes-layer");

    const link = linkContainer.selectAll("line").data(links).enter().append("line")
        .attr("class", "tree-link")
        .attr("id", d => `l-${(d.source.id || d.source)}-${(d.target.id || d.target)}`);

    const node = nodeContainer.selectAll(".node-group").data(nodes).enter().append("g")
        .attr("class", "node-group")
        .attr("id", d => `node-${d.id}`)
        .on("click", (e, d) => openProfile(d))
        .call(currentView === 'force' ? d3.drag().on("start", dragStart).on("drag", dragging).on("end", dragEnd) : () => {});

    node.append("circle").attr("r", 40).attr("class", "node-base");
    node.append("clipPath").attr("id", d => `cp-${d.id}`).append("circle").attr("r", 37);

    node.append("image")
        .attr("xlink:href", d => d.photo || "https://cdn-icons-png.flaticon.com/512/3135/3135715.png")
        .attr("x", -37).attr("y", -37).attr("width", 74).attr("height", 74)
        .attr("clip-path", d => `url(#cp-${d.id})`).attr("preserveAspectRatio", "xMidYMid slice");

    node.append("text").attr("dy", 65).attr("text-anchor", "middle").attr("class", "node-label").text(d => d.name);

    if(activeNodeId) applyHighlight(activeNodeId);
}

function ticked() {
    g.selectAll(".tree-link")
        .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    g.selectAll(".node-group")
        .attr("transform", d => `translate(${d.x},${d.y})`);
}

function applyHighlight(id) {
    g.selectAll(".node-base").classed("status-selected", false).classed("status-related", false);
    g.selectAll(".tree-link").classed("link-active", false);

    g.select(`#node-${id} .node-base`).classed("status-selected", true);

    // Подсветка ПРЕДКОВ (вверх до упора)
    let pathId = id;
    while(pathId) {
        let nodeData = globalData.find(n => n.id === pathId);
        if(!nodeData) break;
        if(nodeData.id !== id) g.select(`#node-${pathId} .node-base`).classed("status-related", true);
        if(nodeData.fatherId) {
            g.select(`#l-${nodeData.fatherId}-${pathId}`).classed("link-active", true);
            pathId = nodeData.fatherId;
        } else pathId = null;
    }

    // Подсветка ПОТОМКОВ (один уровень вниз)
    globalData.filter(n => n.fatherId === id).forEach(child => {
        g.select(`#node-${child.id} .node-base`).classed("status-related", true);
        g.select(`#l-${id}-${child.id}`).classed("link-active", true);
    });
}

function openProfile(p) {
    activeNodeId = p.id;
    const father = globalData.find(f => f.id === p.fatherId);
    
    document.getElementById('p-patronymic').innerText = father ? `${father.name} ұлы` : "";
    document.getElementById('p-full-name').innerText = p.name;
    document.getElementById('p-birth').innerText = p.birth ? `Туған жылы: ${p.birth}` : "";
    document.getElementById('p-death').innerText = p.death ? `Қайтқан жылы: ${p.death}` : "";
    
    const phone = document.getElementById('p-phone-link');
    phone.innerText = p.phone || ""; phone.href = `tel:${p.phone}`;
    phone.style.display = p.phone ? "block" : "none";

    const img = document.getElementById('p-photo'), ph = document.getElementById('p-avatar-placeholder');
    if(p.photo) { img.src = p.photo; img.style.display="block"; ph.style.display="none"; }
    else { img.style.display="none"; ph.style.display="block"; }

    updatePills(p);
    document.getElementById('profileModal').classList.add('active');
}

function updatePills(p) {
    const aArea = document.getElementById('p-ancestors'), dArea = document.getElementById('p-descendants');
    aArea.innerHTML = ""; dArea.innerHTML = "";
    
    let path = []; let c = p;
    while(c && c.fatherId) {
        c = globalData.find(x => x.id === c.fatherId);
        if(c) path.push(c);
    }
    path.reverse().forEach((anc, i) => {
        const span = document.createElement('span'); span.className = 'pill-item'; span.innerText = anc.name;
        span.onclick = (e) => { e.stopPropagation(); openProfile(anc); };
        aArea.appendChild(span);
        if(i < path.length - 1) aArea.innerHTML += '<b class="arrow-divider">→</b>';
    });

    globalData.filter(x => x.fatherId === p.id).forEach(child => {
        const span = document.createElement('span'); span.className = 'pill-item'; span.innerText = child.name;
        span.onclick = (e) => { e.stopPropagation(); openProfile(child); };
        dArea.appendChild(span);
    });
}

function setupInterface() {
    document.getElementById('profileJumpBtn').onclick = () => {
        document.getElementById('profileModal').classList.remove('active');
        const node = globalData.find(n => n.id === activeNodeId);
        applyHighlight(activeNodeId);
        const scale = 1.1;
        svg.transition().duration(800).call(zoomObj.transform, d3.zoomIdentity.translate(window.innerWidth/2 - node.x*scale, window.innerHeight/2 - node.y*scale).scale(scale));
    };

    const inp = document.getElementById('memberSearch'), list = document.getElementById('searchResults');
    inp.oninput = () => {
        const val = inp.value.toLowerCase(); list.innerHTML = "";
        if(val.length < 2) return list.classList.remove('active');
        globalData.filter(p => p.name.toLowerCase().includes(val)).forEach(p => {
            const f = globalData.find(x => x.id === p.fatherId);
            const d = document.createElement('div'); d.className = 'search-row';
            d.innerHTML = `<strong>${p.name}</strong><small>${f ? f.name+' ұлы' : ''} ${p.birth ? '| '+p.birth : ''}</small>`;
            d.onclick = () => { openProfile(p); list.classList.remove('active'); inp.value=""; };
            list.appendChild(d);
        });
        list.classList.add('active');
    };

    document.getElementById('mobileSearchBtn').onclick = () => document.getElementById('searchContainer').classList.toggle('visible');
    
    document.getElementById('burgerToggle').onclick = function() {
        this.classList.toggle('opened');
        document.getElementById('navLinks').classList.toggle('active');
    };

    document.getElementById('viewFilter').onclick = () => { 
        currentView = currentView === 'force' ? 'tree' : 'force'; 
        render(); 
    };
    
    document.querySelector('.modal-close').onclick = () => document.getElementById('profileModal').classList.remove('active');
}

function dragStart(e) { if (!e.active && simulation) simulation.alphaTarget(0.3).restart(); e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; }
function dragging(e) { e.subject.fx = e.x; e.subject.fy = e.y; }
function dragEnd(e) { if (!e.active && simulation) simulation.alphaTarget(0); e.subject.fx = null; e.subject.fy = null; }
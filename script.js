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
        fatherId: (d.id === "1" || !d.father_id || d.father_id === "0") ? null : String(d.father_id)
    }));
    init();
});

function init() {
    svg = d3.select("#treeCanvas").attr("width", window.innerWidth).attr("height", window.innerHeight);
    g = svg.append("g");
    zoomObj = d3.zoom().scaleExtent([0.02, 3]).on("zoom", (e) => g.attr("transform", e.transform));
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
    const linksData = globalData.filter(d => d.fatherId && globalData.find(f => f.id === d.fatherId)).map(d => ({ source: d.fatherId, target: d.id }));

    if (currentView === 'force') {
        simulation = d3.forceSimulation(globalData)
            .force("link", d3.forceLink(linksData).id(d => d.id).distance(180))
            .force("charge", d3.forceManyBody().strength(-1500))
            .force("center", d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2))
            .force("collision", d3.forceCollide().radius(100))
            .on("tick", ticked);
        drawGraph(globalData, linksData);
    } else {
        try {
            const stratify = d3.stratify().id(d => d.id).parentId(d => d.fatherId);
            const root = stratify(globalData);
            const treeLayout = d3.tree().nodeSize([250, 300]);
            treeLayout(root);
            const nodes = root.descendants().map(d => {
                d.xPos = d.x + window.innerWidth / 2;
                d.yPos = d.y + 150;
                return Object.assign(d.data, { x: d.xPos, y: d.yPos });
            });
            const links = root.links().map(l => ({
                source: { id: l.source.id, x: l.source.xPos, y: l.source.yPos },
                target: { id: l.target.id, x: l.target.xPos, y: l.target.yPos }
            }));
            drawGraph(nodes, links);
            ticked(); 
            svg.transition().duration(1000).call(zoomObj.transform, d3.zoomIdentity.translate(window.innerWidth/2 - nodes.find(n=>n.id==="1").x, 50).scale(0.7));
        } catch (err) {
            console.error("Ошибка построения дерева:", err);
        }
    }
}

function drawGraph(nodes, links) {
    const linkContainer = g.append("g").attr("class", "links-layer");
    const nodeContainer = g.append("g").attr("class", "nodes-layer");
    linkContainer.selectAll(".tree-link").data(links).enter().append("path").attr("class", "tree-link").attr("id", d => `l-${(d.source.id || d.source)}-${(d.target.id || d.target)}`).attr("fill", "none");
    const node = nodeContainer.selectAll(".node-group").data(nodes).enter().append("g").attr("class", "node-group").attr("id", d => `node-${d.id}`).style("cursor", "pointer").on("click", (e, d) => openProfile(d)).call(currentView === 'force' ? d3.drag().on("start", dragStart).on("drag", dragging).on("end", dragEnd) : () => {});
    node.append("circle").attr("r", 45).attr("class", "node-base");
    node.append("clipPath").attr("id", d => `cp-${d.id}`).append("circle").attr("r", 42);
    node.append("image").attr("xlink:href", d => d.photo || "https://cdn-icons-png.flaticon.com/512/3135/3135715.png").attr("x", -42).attr("y", -42).attr("width", 84).attr("height", 84).attr("clip-path", d => `url(#cp-${d.id})`).attr("preserveAspectRatio", "xMidYMid slice");
    node.append("text").attr("dy", 75).attr("text-anchor", "middle").attr("class", "node-label").text(d => d.name);
    if(activeNodeId) applyHighlight(activeNodeId);
}

function ticked() {
    if (currentView === 'force') {
        g.selectAll(".tree-link").attr("d", d => `M${d.source.x},${d.source.y} L${d.target.x},${d.target.y}`);
    } else {
        g.selectAll(".tree-link").attr("d", d => `M${d.source.x},${d.source.y} C${d.source.x},${(d.source.y + d.target.y) / 2} ${d.target.x},${(d.source.y + d.target.y) / 2} ${d.target.x},${d.target.y}`);
    }
    g.selectAll(".node-group").attr("transform", d => `translate(${d.x},${d.y})`);
}

function applyHighlight(id) {
    g.selectAll(".node-base").classed("status-selected", false).classed("status-related", false);
    g.selectAll(".tree-link").classed("link-active", false);
    g.select(`#node-${id} .node-base`).classed("status-selected", true);
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
    globalData.filter(n => n.fatherId === id).forEach(child => {
        g.select(`#node-${child.id} .node-base`).classed("status-related", true);
        g.select(`#l-${id}-${child.id}`).classed("link-active", true);
    });
}

function openProfile(p) {
    activeNodeId = p.id;
    const father = globalData.find(f => f.id === p.fatherId);
    
    // СЛИТНОЕ ОТЧЕСТВО
    document.getElementById('p-patronymic').innerText = father ? `${father.name}ұлы` : "";
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
    
    // ВСЯ ЦЕПОЧКА ПРЕДКОВ С ПЕРЕХОДАМИ
    let path = []; 
    let current = p;
    while(current && current.fatherId) {
        let father = globalData.find(x => x.id === current.fatherId);
        if(father) {
            path.push(father);
            current = father;
        } else break;
    }

    path.reverse().forEach((anc, i) => {
        const span = document.createElement('span'); 
        span.className = 'pill-item'; 
        span.innerText = anc.name;
        span.onclick = (e) => { e.stopPropagation(); openProfile(anc); };
        aArea.appendChild(span);
        if(i < path.length - 1) {
            const arrow = document.createElement('b');
            arrow.className = 'arrow-divider';
            arrow.innerText = ' → ';
            aArea.appendChild(arrow);
        }
    });

    globalData.filter(x => x.fatherId === p.id).forEach(child => {
        const span = document.createElement('span'); 
        span.className = 'pill-item'; 
        span.innerText = child.name;
        span.onclick = (e) => { e.stopPropagation(); openProfile(child); };
        dArea.appendChild(span);
    });
}

function setupInterface() {
    document.getElementById('profileJumpBtn').onclick = () => {
        document.getElementById('profileModal').classList.remove('active');
        const node = globalData.find(n => n.id === activeNodeId);
        applyHighlight(activeNodeId);
        svg.transition().duration(800).call(zoomObj.transform, d3.zoomIdentity.translate(window.innerWidth/2 - node.x*1.1, window.innerHeight/2 - node.y*1.1).scale(1.1));
    };

    const inp = document.getElementById('memberSearch'), list = document.getElementById('searchResults');
    inp.oninput = () => {
        const val = inp.value.toLowerCase(); list.innerHTML = "";
        if(val.length < 2) return list.classList.remove('active');
        globalData.filter(p => p.name.toLowerCase().includes(val)).forEach(p => {
            const f = globalData.find(x => x.id === p.fatherId);
            const d = document.createElement('div'); d.className = 'search-row';
            // СЛИТНОЕ ОТЧЕСТВО В ПОИСКЕ
            d.innerHTML = `<strong>${p.name}</strong><small>${f ? f.name + 'ұлы' : ''} ${p.birth ? '| ' + p.birth : ''}</small>`;
            d.onclick = () => { openProfile(p); list.classList.remove('active'); inp.value=""; };
            list.appendChild(d);
        });
        list.classList.add('active');
    };

    document.getElementById('mobileSearchBtn').onclick = () => document.getElementById('searchContainer').classList.toggle('visible');
    document.getElementById('burgerToggle').onclick = function() { this.classList.toggle('opened'); document.getElementById('navLinks').classList.toggle('active'); };
    document.getElementById('viewFilter').onclick = () => { currentView = currentView === 'force' ? 'tree' : 'force'; render(); };
    document.querySelector('.modal-close').onclick = () => document.getElementById('profileModal').classList.remove('active');
}

function dragStart(e) { if (!e.active && simulation) simulation.alphaTarget(0.3).restart(); e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; }
function dragging(e) { e.subject.fx = e.x; e.subject.fy = e.y; }
function dragEnd(e) { if (!e.active && simulation) simulation.alphaTarget(0); e.subject.fx = null; e.subject.fy = null; }
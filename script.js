const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLsYHGO0lvQdxVywXS-F7io9Vw2bhpADxTI4nfuf0PdoZh4hVwKPKS0iKTmKycX2WsldvuPur2e58O/pub?output=csv";

let globalData = [];
let simulation, svg, g, zoom;
let currentView = 'force'; 
let selectedId = null;

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
    initGraph();
    setupEvents();
});

function initGraph() {
    svg = d3.select("#treeCanvas");
    g = svg.append("g");
    zoom = d3.zoom().scaleExtent([0.05, 3]).on("zoom", (e) => g.attr("transform", e.transform));
    svg.call(zoom);
    render();
}

function render() {
    g.selectAll("*").remove();
    const links = globalData
        .filter(d => d.fatherId && globalData.find(f => f.id === d.fatherId))
        .map(d => ({ source: d.fatherId, target: d.id }));

    if (currentView === 'force') {
        simulation = d3.forceSimulation(globalData)
            .force("link", d3.forceLink(links).id(d => d.id).distance(150))
            .force("charge", d3.forceManyBody().strength(-800))
            .force("center", d3.forceCenter(window.innerWidth/2, window.innerHeight/2))
            .on("tick", updatePositions);
        draw(globalData, links);
    } else {
        const root = d3.stratify().id(d => d.id).parentId(d => d.fatherId)(globalData);
        d3.tree().nodeSize([160, 220])(root);
        const nodes = root.descendants().map(d => ({...d.data, x: d.x + window.innerWidth/2, y: d.y + 100}));
        const tLinks = root.links().map(l => ({
            source: nodes.find(n => n.id === l.source.id),
            target: nodes.find(n => n.id === l.target.id)
        }));
        draw(nodes, tLinks);
        updatePositions();
    }
}

function draw(nodes, links) {
    const link = g.append("g").selectAll("line").data(links).enter().append("line")
        .attr("class", "link")
        .attr("id", d => `l-${d.source.id || d.source}-${d.target.id || d.target}`);

    const node = g.append("g").selectAll(".node").data(nodes).enter().append("g")
        .attr("class", "node")
        .attr("id", d => `n-${d.id}`)
        .on("click", (e, d) => showProfile(d))
        .call(d3.drag().on("start", dragStart).on("drag", dragging).on("end", dragEnd));

    node.append("circle").attr("r", 35).attr("class", "n-circle");
    node.append("clipPath").attr("id", d => `clip-${d.id}`).append("circle").attr("r", 32);
    node.append("image")
        .attr("xlink:href", d => d.photo || "https://cdn-icons-png.flaticon.com/512/3135/3135715.png")
        .attr("x", -32).attr("y", -32).attr("width", 64).attr("height", 64)
        .attr("clip-path", d => `url(#clip-${d.id})`).attr("preserveAspectRatio", "xMidYMid slice");
    node.append("text").attr("dy", 55).attr("text-anchor", "middle").text(d => d.name);

    if(selectedId) applyHighlight(selectedId);
}

function showProfile(p) {
    selectedId = p.id;
    const father = globalData.find(f => f.id === p.fatherId);
    document.getElementById('p-patronymic').innerText = father ? `${father.name} ұлы` : "";
    document.getElementById('p-full-name').innerText = p.name;
    document.getElementById('p-birth').innerText = p.birth ? `Туылды: ${p.birth}` : "";
    document.getElementById('p-death').innerText = p.death ? `Қайтты: ${p.death}` : "";
    
    const phone = document.getElementById('p-phone-link');
    phone.innerText = p.phone || ""; phone.href = `tel:${p.phone}`;
    phone.style.display = p.phone ? "block" : "none";

    const img = document.getElementById('p-photo'), ph = document.getElementById('p-avatar-placeholder');
    if(p.photo) { img.src = p.photo; img.style.display="block"; ph.style.display="none"; }
    else { img.style.display="none"; ph.style.display="block"; }

    renderPills(p);
    document.getElementById('profileModal').classList.add('active');
}

function applyHighlight(id) {
    g.selectAll(".n-circle").classed("highlight-green", false).classed("highlight-blue", false);
    g.selectAll(".link").classed("link-blue", false);

    // 1. Зеленый - текущий
    g.select(`#n-${id} .n-circle`).classed("highlight-green", true);

    // 2. Синий - Вся ветка предков вверх
    let currId = id;
    while(currId) {
        let node = globalData.find(n => n.id === currId);
        if(!node) break;
        g.select(`#n-${currId} .n-circle`).classed("highlight-blue", !g.select(`#n-${currId} .n-circle`).classed("highlight-green"));
        if(node.fatherId) {
            g.select(`#l-${node.fatherId}-${currId}`).classed("link-blue", true);
            currId = node.fatherId;
        } else currId = null;
    }

    // 3. Синий - Прямые потомки (один уровень вниз)
    globalData.filter(n => n.fatherId === id).forEach(child => {
        g.select(`#n-${child.id} .n-circle`).classed("highlight-blue", true);
        g.select(`#l-${id}-${child.id}`).classed("link-blue", true);
    });
}

function renderPills(p) {
    const aCont = document.getElementById('p-ancestors'), dCont = document.getElementById('p-descendants');
    aCont.innerHTML = ""; dCont.innerHTML = "";
    
    let ancestors = []; let curr = p;
    while(curr && curr.fatherId) {
        curr = globalData.find(x => x.id === curr.fatherId);
        if(curr) ancestors.push(curr);
    }
    ancestors.reverse().forEach((anc, i) => {
        const span = document.createElement('span'); span.className = 'pill'; span.innerText = anc.name;
        span.onclick = (e) => { e.stopPropagation(); showProfile(anc); };
        aCont.appendChild(span);
        if(i < ancestors.length - 1) aCont.innerHTML += '<span class="arr">→</span>';
    });

    globalData.filter(x => x.fatherId === p.id).forEach(c => {
        const span = document.createElement('span'); span.className = 'pill'; span.innerText = c.name;
        span.onclick = (e) => { e.stopPropagation(); showProfile(c); };
        dCont.appendChild(span);
    });
}

function setupEvents() {
    document.getElementById('jumpToNode').onclick = () => {
        document.getElementById('profileModal').classList.remove('active');
        const node = globalData.find(n => n.id === selectedId);
        applyHighlight(selectedId);
        svg.transition().duration(800).call(zoom.transform, d3.zoomIdentity.translate(window.innerWidth/2 - node.x*1.2, window.innerHeight/2 - node.y*1.2).scale(1.2));
    };

    const inp = document.getElementById('memberSearch'), res = document.getElementById('searchResults');
    inp.oninput = () => {
        const v = inp.value.toLowerCase(); res.innerHTML = "";
        if(v.length < 2) return res.classList.remove('active');
        globalData.filter(p => p.name.toLowerCase().includes(v)).forEach(p => {
            const f = globalData.find(x => x.id === p.fatherId);
            const div = document.createElement('div'); div.className = 's-item';
            div.innerHTML = `<strong>${p.name}</strong><small>${f ? f.name+' ұлы' : ''} | ${p.birth}</small>`;
            div.onclick = () => { showProfile(p); res.classList.remove('active'); inp.value=""; };
            res.appendChild(div);
        });
        res.classList.add('active');
    };

    document.getElementById('viewFilter').onclick = () => { currentView = currentView === 'force' ? 'tree' : 'force'; render(); };
    document.getElementById('mobileSearchOpen').onclick = () => document.getElementById('searchWrapper').classList.toggle('show');
    document.getElementById('burgerBtn').onclick = () => { document.getElementById('navMenu').classList.toggle('active'); document.getElementById('burgerBtn').classList.toggle('open'); };
    document.querySelector('.close-modal').onclick = () => document.getElementById('profileModal').classList.remove('active');
}

function updatePositions() {
    g.selectAll(".link").attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    g.selectAll(".node").attr("transform", d => `translate(${d.x},${d.y})`);
}
function dragStart(e) { if (!e.active && simulation) simulation.alphaTarget(0.3).restart(); e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; }
function dragging(e) { e.subject.fx = e.x; e.subject.fy = e.y; }
function dragEnd(e) { if (!e.active && simulation) simulation.alphaTarget(0); e.subject.fx = null; e.subject.fy = null; }
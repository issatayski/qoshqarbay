const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLsYHGO0lvQdxVywXS-F7io9Vw2bhpADxTI4nfuf0PdoZh4hVwKPKS0iKTmKycX2WsldvuPur2e58O/pub?output=csv";

let globalData = [];
let simulation, svg, g, zoomHandler;
let currentView = 'force'; 
let currentSelectedId = null;

d3.csv(SHEET_URL).then(rawData => {
    globalData = rawData.map(d => ({
        id: String(d.id),
        name: d.name,
        photo: d.photo || "",
        birth: d.birth || "",
        death: d.death || "",
        phone: d.phone || "",
        fatherId: (d.father_id && d.father_id !== "" && d.father_id !== "0") ? String(d.father_id) : null
    }));
    initApp();
});

function initApp() {
    const width = window.innerWidth, height = window.innerHeight;
    svg = d3.select("#treeCanvas").attr("width", width).attr("height", height);
    
    zoomHandler = d3.zoom().scaleExtent([0.05, 3]).on("zoom", (e) => g.attr("transform", e.transform));
    svg.call(zoomHandler);
    g = svg.append("g");

    renderGraph();
    setupUI();
}

function renderGraph() {
    g.selectAll("*").remove();
    const links = globalData
        .filter(d => d.fatherId && globalData.find(f => f.id === d.fatherId))
        .map(d => ({ source: d.fatherId, target: d.id }));

    if (currentView === 'force') {
        runForceLayout(globalData, links);
    } else {
        runTreeLayout(globalData, links);
    }
}

function runForceLayout(data, links) {
    simulation = d3.forceSimulation(data)
        .force("link", d3.forceLink(links).id(d => d.id).distance(150))
        .force("charge", d3.forceManyBody().strength(-1000))
        .force("center", d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2))
        .force("x", d3.forceX(window.innerWidth / 2).strength(0.1))
        .force("y", d3.forceY(window.innerHeight / 2).strength(0.1));

    drawElements(data, links);
    simulation.on("tick", updatePositions);
}

function runTreeLayout(data, links) {
    try {
        const stratify = d3.stratify().id(d => d.id).parentId(d => d.fatherId);
        const root = stratify(data);
        // Режим сверху вниз (Top-Down)
        const tree = d3.tree().nodeSize([150, 200]);
        tree(root);

        const nodes = root.descendants().map(d => ({ ...d.data, x: d.x + window.innerWidth/2, y: d.y + 150 }));
        const tLinks = root.links().map(l => ({
            source: { ...l.source.data, x: l.source.x + window.innerWidth/2, y: l.source.y + 150 },
            target: { ...l.target.data, x: l.target.x + window.innerWidth/2, y: l.target.y + 150 }
        }));

        drawElements(nodes, tLinks);
        updatePositions();
    } catch (e) {
        alert("Дерево режимі үшін біртұтас құрылым керек.");
        currentView = 'force'; renderGraph();
    }
}

function drawElements(nodes, links) {
    const link = g.append("g").selectAll("line").data(links).enter().append("line")
        .attr("class", "link").attr("id", d => `link-${d.source.id || d.source}-${d.target.id || d.target}`);

    const node = g.append("g").selectAll(".node").data(nodes).enter().append("g")
        .attr("class", "node")
        .attr("id", d => `node-${d.id}`)
        .on("click", (e, d) => showProfile(d))
        .call(d3.drag().on("start", dragStart).on("drag", dragging).on("end", dragEnd));

    node.append("circle").attr("r", 35).attr("class", "node-circle");
    node.append("clipPath").attr("id", d => `cp-${d.id}`).append("circle").attr("r", 32);

    node.append("image")
        .attr("xlink:href", d => d.photo || "https://cdn-icons-png.flaticon.com/512/3135/3135715.png")
        .attr("x", -32).attr("y", -32).attr("width", 64).attr("height", 64)
        .attr("clip-path", d => `url(#cp-${d.id})`).attr("preserveAspectRatio", "xMidYMid slice");

    node.append("text").attr("dy", 55).attr("text-anchor", "middle").text(d => d.name);
    
    if(currentSelectedId) highlightPerson(currentSelectedId, false);
}

function showProfile(person) {
    currentSelectedId = person.id;
    const father = globalData.find(p => p.id === person.fatherId);
    
    document.getElementById('p-patronymic').innerText = father ? `${father.name} ұлы` : "";
    document.getElementById('p-full-name').innerText = person.name;
    document.getElementById('p-birth').innerText = person.birth ? `Туылды: ${person.birth}` : "";
    document.getElementById('p-death').innerText = person.death ? `Қайтты: ${person.death}` : "";
    
    const phone = document.getElementById('p-phone-link');
    phone.innerText = person.phone || "";
    phone.href = `tel:${person.phone}`;
    phone.style.display = person.phone ? 'block' : 'none';

    const img = document.getElementById('p-photo'), ph = document.getElementById('p-avatar-placeholder');
    if (person.photo) { img.src = person.photo; img.style.display = 'block'; ph.style.display = 'none'; }
    else { img.style.display = 'none'; ph.style.display = 'block'; }

    renderLineage(person);
    document.getElementById('profileModal').classList.add('active');

    // Клик по шапке модалки для перехода к графу
    document.getElementById('profileHeaderArea').onclick = () => {
        document.getElementById('profileModal').classList.remove('active');
        highlightPerson(person.id, true);
    };
}

function highlightPerson(id, shouldZoom) {
    const p = globalData.find(x => x.id === id);
    if (!p) return;

    // Сброс
    g.selectAll(".node-circle").classed("selected", false).classed("related", false);
    g.selectAll(".link").classed("active", false);

    // Подсветка узла
    g.select(`#node-${id} circle`).classed("selected", true);

    // Подсветка связей
    globalData.forEach(node => {
        if (node.fatherId === id) { // дети
            g.select(`#node-${node.id} circle`).classed("related", true);
            g.select(`#link-${id}-${node.id}`).classed("active", true);
        }
        if (node.id === p.fatherId) { // отец
            g.select(`#node-${node.id} circle`).classed("related", true);
            g.select(`#link-${node.id}-${id}`).classed("active", true);
        }
    });

    if (shouldZoom) {
        const scale = 1.2;
        svg.transition().duration(800).call(
            zoomHandler.transform, 
            d3.zoomIdentity.translate(window.innerWidth/2 - p.x*scale, window.innerHeight/2 - p.y*scale).scale(scale)
        );
    }
}

function renderLineage(person) {
    const ancCont = document.getElementById('p-ancestors'), descCont = document.getElementById('p-descendants');
    ancCont.innerHTML = ""; descCont.innerHTML = "";
    
    let ancestors = []; let c = person;
    while(c && c.fatherId) {
        c = globalData.find(x => x.id === c.fatherId);
        if(c) ancestors.push(c);
    }
    ancestors.reverse().forEach((a, i) => {
        const s = document.createElement('span'); s.className = 'lineage-pill'; s.innerText = a.name;
        s.onclick = (e) => { e.stopPropagation(); showProfile(a); };
        ancCont.appendChild(s);
        if(i < ancestors.length-1) { const arr = document.createElement('span'); arr.className='lineage-arrow'; arr.innerText='→'; ancCont.appendChild(arr); }
    });

    globalData.filter(x => x.fatherId === person.id).forEach(ch => {
        const s = document.createElement('span'); s.className = 'lineage-pill'; s.innerText = ch.name;
        s.onclick = (e) => { e.stopPropagation(); showProfile(ch); };
        descCont.appendChild(s);
    });
}

function setupUI() {
    // Поиск
    const inp = document.getElementById('memberSearch'), res = document.getElementById('searchResults');
    inp.oninput = () => {
        const v = inp.value.toLowerCase();
        res.innerHTML = "";
        if(v.length < 2) return res.classList.remove('active');
        globalData.filter(p => p.name.toLowerCase().includes(v)).forEach(p => {
            const f = globalData.find(x => x.id === p.fatherId);
            const d = document.createElement('div'); d.className = 'search-item';
            d.innerHTML = `<strong>${p.name}</strong><small>${f ? f.name+' ұлы' : ''} | ${p.birth}</small>`;
            d.onclick = () => { showProfile(p); res.classList.remove('active'); inp.value=""; };
            res.appendChild(d);
        });
        res.classList.add('active');
    };

    // Мобильный поиск
    document.getElementById('searchTrigger').onclick = () => {
        document.getElementById('searchWrapper').classList.toggle('mobile-visible');
    };

    // Бургер
    document.getElementById('burgerBtn').onclick = () => {
        document.getElementById('navMenu').classList.toggle('active');
        document.getElementById('burgerBtn').classList.toggle('open');
    };

    document.getElementById('viewFilter').onclick = () => {
        currentView = (currentView === 'force' ? 'tree' : 'force');
        renderGraph();
    };

    document.querySelector('.close-modal').onclick = () => document.getElementById('profileModal').classList.remove('active');
}

function updatePositions() {
    g.selectAll(".link").attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    g.selectAll(".node").attr("transform", d => `translate(${d.x},${d.y})`);
}

function dragStart(e) { if (!e.active && simulation) simulation.alphaTarget(0.3).restart(); e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; }
function dragging(e) { e.subject.fx = e.x; e.subject.fy = e.y; }
function dragEnd(e) { if (!e.active && simulation) simulation.alphaTarget(0); e.subject.fx = null; e.subject.fy = null; }
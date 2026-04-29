const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLsYHGO0lvQdxVywXS-F7io9Vw2bhpADxTI4nfuf0PdoZh4hVwKPKS0iKTmKycX2WsldvuPur2e58O/pub?output=csv";

let globalData = [];
let simulation;
let svg, g;
let currentView = 'force'; // 'force' или 'tree'
let highlightedNodes = new Set();
let highlightedLinks = new Set();

d3.csv(SHEET_URL).then(rawData => {
    globalData = rawData.map(d => ({
        id: Number(d.id),
        name: d.name,
        photo: d.photo || "",
        birth: d.birth || "—",
        death: d.death || null,
        phone: d.phone || "—",
        fatherId: d.father_id ? Number(d.father_id) : null
    }));
    renderGraph();
}).catch(err => console.error("Ошибка загрузки:", err));

function renderGraph() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    d3.select("#treeCanvas").selectAll("*").remove(); // Чистим перед рендером
    
    svg = d3.select("#treeCanvas")
        .attr("width", width)
        .attr("height", height)
        .call(d3.zoom().scaleExtent([0.1, 3]).on("zoom", (e) => g.attr("transform", e.transform)));

    // Пересоздаем defs после очистки
    const defs = svg.append("defs");
    defs.append("marker").attr("id", "arrowhead").attr("viewBox", "0 -5 10 10").attr("refX", 32).attr("refY", 0).attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto").append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#d2d2d7");
    defs.append("marker").attr("id", "arrowhead-active").attr("viewBox", "0 -5 10 10").attr("refX", 32).attr("refY", 0).attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto").append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#28a745");

    g = svg.append("g");

    const links = globalData
        .filter(d => d.fatherId && globalData.find(p => p.id === d.fatherId))
        .map(d => ({ source: d.fatherId, target: d.id }));

    if (currentView === 'force') {
        runForceLayout(globalData, links);
    } else {
        runTreeLayout(globalData, links);
    }

    setupSearch();
    applyPersistentHighlight(); // Сохраняем выделение при смене вида
}

function runForceLayout(data, links) {
    simulation = d3.forceSimulation(data)
        .force("link", d3.forceLink(links).id(d => d.id).distance(150))
        .force("charge", d3.forceManyBody().strength(-2000))
        .force("center", d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2))
        .force("collision", d3.forceCollide().radius(80));

    drawGraphElements(data, links);

    simulation.on("tick", () => {
        g.selectAll(".link").attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
        g.selectAll(".node").attr("transform", d => `translate(${d.x},${d.y})`);
    });
}

function runTreeLayout(data, links) {
    const stratify = d3.stratify().id(d => d.id).parentId(d => d.fatherId);
    const root = stratify(data);
    const treeLayout = d3.tree().nodeSize([120, 250]);
    treeLayout(root);

    const treeNodes = root.descendants();
    const treeLinks = root.links();

    // Синхронизируем координаты для корректной работы highlight
    treeNodes.forEach(d => { d.x_val = d.x; d.y_val = d.y; d.x = d.y_val + window.innerWidth/4; d.y = d.x_val + window.innerHeight/2; });

    drawGraphElements(treeNodes.map(d => d.data), treeLinks.map(l => ({ source: l.source.data, target: l.target.data })));
    
    g.selectAll(".link").attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    g.selectAll(".node").attr("transform", d => `translate(${d.x},${d.y})`);
}

function drawGraphElements(nodes, links) {
    const link = g.append("g").selectAll("line").data(links).enter().append("line")
        .attr("class", "link")
        .attr("marker-end", "url(#arrowhead)");

    const node = g.append("g").selectAll(".node").data(nodes).enter().append("g")
        .attr("class", "node")
        .on("click", (e, d) => showProfile(d))
        .call(d3.drag().on("start", dragStart).on("drag", dragging).on("end", dragEnd));

    node.append("circle").attr("r", 25).attr("fill", "#fff").attr("stroke", "#0071e3").attr("stroke-width", 2);
    node.append("text").attr("dy", 45).attr("text-anchor", "middle").text(d => d.name);
}

// Умная подсветка: предок -> цель -> дети
function highlightFullLineage(targetId) {
    highlightedNodes.clear();
    highlightedLinks.clear();

    const findAncestors = (id) => {
        highlightedNodes.add(id);
        const person = globalData.find(p => p.id === id);
        if (person && person.fatherId) {
            highlightedLinks.add(`${person.fatherId}-${id}`);
            findAncestors(person.fatherId);
        }
    };

    const findChildren = (id) => {
        globalData.filter(p => p.fatherId === id).forEach(child => {
            highlightedNodes.add(child.id);
            highlightedLinks.add(`${id}-${child.id}`);
        });
    };

    findAncestors(targetId);
    findChildren(targetId);
    applyPersistentHighlight();
}

function applyPersistentHighlight() {
    g.selectAll(".node circle").attr("stroke", d => highlightedNodes.has(d.id) ? "#28a745" : "#0071e3")
        .attr("stroke-width", d => highlightedNodes.has(d.id) ? 5 : 2);
    
    g.selectAll(".link")
        .attr("stroke", d => highlightedLinks.has(`${d.source.id || d.source}-${d.target.id || d.target}`) ? "#28a745" : "#d2d2d7")
        .attr("stroke-width", d => highlightedLinks.has(`${d.source.id || d.source}-${d.target.id || d.target}`) ? 4 : 2)
        .attr("marker-end", d => highlightedLinks.has(`${d.source.id || d.source}-${d.target.id || d.target}`) ? "url(#arrowhead-active)" : "url(#arrowhead)");
}

// Фильтр вида
document.getElementById('viewFilter').onclick = function() {
    currentView = (currentView === 'force') ? 'tree' : 'force';
    renderGraph();
};

function showProfile(person) {
    const modal = document.getElementById('profileModal');
    const father = globalData.find(p => p.id === person.fatherId);
    const fullNameElement = document.getElementById('p-full-name');
    fullNameElement.innerText = father ? `${father.name.split(' ')[0]}ұлы ${person.name}` : person.name;

    document.querySelector('.info-side').onclick = () => {
        modal.classList.remove('active');
        highlightFullLineage(person.id);
        
        const width = window.innerWidth;
        const height = window.innerHeight;
        const targetX = person.x || width/2;
        const targetY = person.y || height/2;

        svg.transition().duration(1000).call(
            d3.zoom().transform, 
            d3.zoomIdentity.translate(width/2 - targetX * 1.2, height/2 - targetY * 1.2).scale(1.2)
        );
    };

    // Остальная логика профиля (даты, телефон, предки/потомки) остается прежней...
    document.getElementById('p-birth').innerText = `род. ${person.birth}`;
    const deathElem = document.getElementById('p-death');
    if (person.death) { deathElem.innerText = ` — ум. ${person.death}`; deathElem.style.display = 'inline'; } 
    else { deathElem.style.display = 'none'; }

    const phoneLink = document.getElementById('p-phone-link');
    if (person.phone && person.phone !== "—") {
        phoneLink.innerText = person.phone;
        phoneLink.href = `tel:${person.phone.replace(/\D/g, '')}`;
        phoneLink.style.display = 'block';
    } else { phoneLink.style.display = 'none'; }

    const img = document.getElementById('p-photo');
    const placeholder = document.getElementById('p-avatar-placeholder');
    if (person.photo && person.photo.length > 5) {
        img.src = person.photo; img.style.display = 'block'; placeholder.style.display = 'none';
    } else { img.style.display = 'none'; placeholder.style.display = 'block'; }

    renderLineageLists(person);
    modal.classList.add('active');
}

function renderLineageLists(person) {
    const ancCont = document.getElementById('p-ancestors');
    const ancestors = [];
    let curr = person;
    while(curr && curr.fatherId) {
        curr = globalData.find(p => p.id === curr.fatherId);
        if(curr) ancestors.push(curr);
    }
    ancCont.innerHTML = ancestors.length ? "" : "<p>Основатель</p>";
    ancestors.reverse().forEach(anc => {
        const div = document.createElement('div');
        div.className = 'lineage-item';
        div.innerText = `↑ ${anc.name}`;
        div.onclick = (e) => { e.stopPropagation(); showProfile(anc); };
        ancCont.appendChild(div);
    });

    const children = globalData.filter(p => p.fatherId === person.id);
    const descCont = document.getElementById('p-descendants');
    descCont.innerHTML = children.length ? "" : "<p>Деректер жоқ</p>";
    children.forEach(child => {
        const div = document.createElement('div');
        div.className = 'lineage-item';
        div.innerText = `↳ ${child.name}`;
        div.onclick = (e) => { e.stopPropagation(); showProfile(child); };
        descCont.appendChild(div);
    });
}

// Стандартные функции драга и поиска
function setupSearch() {
    const searchInput = document.getElementById('memberSearch');
    const searchResults = document.getElementById('searchResults');
    searchInput.oninput = function() {
        const val = this.value.toLowerCase();
        searchResults.innerHTML = "";
        if (val.length < 2) { searchResults.classList.remove('active'); return; }
        const matches = globalData.filter(p => p.name.toLowerCase().includes(val));
        if (matches.length > 0) {
            searchResults.classList.add('active');
            matches.forEach(person => {
                const div = document.createElement('div');
                div.className = 'search-item';
                div.innerHTML = `<strong>${person.name}</strong>`;
                div.onclick = () => { showProfile(person); searchResults.classList.remove('active'); };
                searchResults.appendChild(div);
            });
        }
    };
}
function dragStart(e) { if (!e.active && simulation) simulation.alphaTarget(0.3).restart(); e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; }
function dragging(e) { e.subject.fx = e.x; e.subject.fy = e.y; }
function dragEnd(e) { if (!e.active && simulation) simulation.alphaTarget(0); e.subject.fx = null; e.subject.fy = null; }
document.querySelector('.close-modal').onclick = () => document.getElementById('profileModal').classList.remove('active');
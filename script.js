const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLsYHGO0lvQdxVywXS-F7io9Vw2bhpADxTI4nfuf0PdoZh4hVwKPKS0iKTmKycX2WsldvuPur2e58O/pub?output=csv";

let globalData = [];
let simulation;
let svg, g;
let currentView = 'force'; 
let highlightedNodes = new Set();
let highlightedLinks = new Set();

d3.csv(SHEET_URL).then(rawData => {
    globalData = rawData.map(d => ({
        id: String(d.id), // Приводим к строке для стабильности d3.stratify
        name: d.name,
        photo: d.photo || "",
        birth: d.birth || "—",
        phone: d.phone || "—",
        fatherId: (d.father_id && d.father_id !== "" && d.father_id !== "0") ? String(d.father_id) : null
    }));
    renderGraph();
    setupSearch();
}).catch(err => console.error("Ошибка загрузки:", err));

function renderGraph() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    d3.select("#treeCanvas").selectAll("g").remove(); 
    svg = d3.select("#treeCanvas")
        .attr("width", width)
        .attr("height", height)
        .call(d3.zoom().scaleExtent([0.1, 3]).on("zoom", (e) => g.attr("transform", e.transform)));

    g = svg.append("g");

    const links = globalData
        .filter(d => d.fatherId !== null)
        .map(d => ({ source: d.fatherId, target: d.id }));

    if (currentView === 'force') {
        runForceLayout(globalData, links);
    } else {
        runTreeLayout(globalData, links);
    }
    applyPersistentHighlight();
}

function runForceLayout(data, links) {
    simulation = d3.forceSimulation(data)
        .force("link", d3.forceLink(links).id(d => d.id).distance(150))
        .force("charge", d3.forceManyBody().strength(-1500))
        .force("center", d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2))
        .force("collision", d3.forceCollide().radius(70));

    drawGraphElements(data, links);

    simulation.on("tick", () => {
        g.selectAll(".link").attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
        g.selectAll(".node").attr("transform", d => `translate(${d.x},${d.y})`);
    });
}

function runTreeLayout(data, links) {
    try {
        // Ищем корень: элемент без отца или с ID "1"
        const rootCandidate = data.find(d => d.fatherId === null || d.id === "1");
        if (!rootCandidate) throw new Error("Root not found");

        const stratify = d3.stratify().id(d => d.id).parentId(d => d.fatherId);
        const root = stratify(data);
        const treeLayout = d3.tree().nodeSize([120, 250]);
        treeLayout(root);

        const treeNodes = root.descendants();
        const treeLinks = root.links();

        treeNodes.forEach(d => {
            d.x_pos = d.y + 100; 
            d.y_pos = d.x + (window.innerHeight / 2);
            d.x = d.x_pos; d.y = d.y_pos;
        });

        drawGraphElements(treeNodes.map(d => ({...d.data, x: d.x, y: d.y})), 
                          treeLinks.map(l => ({
                              source: {...l.source.data, x: l.source.x, y: l.source.y}, 
                              target: {...l.target.data, x: l.target.x, y: l.target.y}
                          })));
        
        updatePositions();
    } catch (e) {
        console.error("Tree Error:", e);
        alert("Режим дерева қатесі: Ортақ ата (id: 1) табылмады.");
        currentView = 'force';
        renderGraph();
    }
}

function drawGraphElements(nodes, links) {
    const link = g.append("g").selectAll("line").data(links).enter().append("line")
        .attr("class", "link")
        .attr("marker-end", "url(#arrowhead)");

    const node = g.append("g").selectAll(".node").data(nodes).enter().append("g")
        .attr("class", "node")
        .on("click", (e, d) => showProfile(d))
        .call(d3.drag().on("start", dragStart).on("drag", dragging).on("end", dragEnd));

    node.append("circle").attr("r", 30).attr("fill", "#fff").attr("stroke", "#0071e3").attr("stroke-width", 2);
    node.append("clipPath").attr("id", d => `clip-${d.id}`).append("circle").attr("r", 28);

    node.append("image")
        .attr("xlink:href", d => (d.photo && d.photo.length > 5) ? d.photo : "https://cdn-icons-png.flaticon.com/512/3135/3135715.png")
        .attr("x", -28).attr("y", -28).attr("width", 56).attr("height", 56)
        .attr("clip-path", d => `url(#clip-${d.id})`)
        .attr("preserveAspectRatio", "xMidYMid slice");

    node.append("text").attr("dy", 48).attr("text-anchor", "middle").text(d => d.name).style("font-weight", "600");
}

function showProfile(person) {
    const modal = document.getElementById('profileModal');
    const father = globalData.find(p => p.id === person.fatherId);
    
    document.getElementById('p-full-name').innerText = father ? `${father.name} ұлы ${person.name}` : person.name;
    document.getElementById('p-birth').innerText = `Туған жылы: ${person.birth}`;
    
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
    
    ancCont.innerHTML = ancestors.length ? "" : "<p>Түп ата</p>";
    ancestors.reverse().forEach(anc => {
        const div = document.createElement('div');
        div.className = 'lineage-item-pill';
        div.innerText = anc.name;
        div.onclick = () => showProfile(anc);
        ancCont.appendChild(div);
    });

    const children = globalData.filter(p => p.fatherId === person.id);
    const descCont = document.getElementById('p-descendants');
    descCont.innerHTML = children.length ? "" : "<p>Ұрпақтар жоқ</p>";
    children.forEach(child => {
        const div = document.createElement('div');
        div.className = 'lineage-item-pill';
        div.innerText = child.name;
        div.onclick = () => showProfile(child);
        descCont.appendChild(div);
    });
}

function applyPersistentHighlight() {
    g.selectAll(".node circle").attr("stroke", d => highlightedNodes.has(d.id) ? "#28a745" : "#0071e3")
        .attr("stroke-width", d => highlightedNodes.has(d.id) ? 6 : 2);
    g.selectAll(".link")
        .attr("stroke", d => highlightedLinks.has(`${d.source.id || d.source}-${d.target.id || d.target}`) ? "#28a745" : "#d2d2d7")
        .attr("stroke-width", d => highlightedLinks.has(`${d.source.id || d.source}-${d.target.id || d.target}`) ? 4 : 2);
}

function setupSearch() {
    const input = document.getElementById('memberSearch');
    const results = document.getElementById('searchResults');
    input.oninput = function() {
        const val = this.value.toLowerCase();
        results.innerHTML = "";
        if (val.length < 2) { results.classList.remove('active'); return; }
        const matches = globalData.filter(p => p.name.toLowerCase().includes(val));
        if (matches.length > 0) {
            results.classList.add('active');
            matches.forEach(p => {
                const div = document.createElement('div');
                div.className = 'search-item';
                div.innerHTML = `<strong>${p.name}</strong><small>${p.birth}</small>`;
                div.onclick = () => { showProfile(p); results.classList.remove('active'); input.value = ""; };
                results.appendChild(div);
            });
        }
    };
}

document.getElementById('viewFilter').onclick = () => { currentView = (currentView === 'force' ? 'tree' : 'force'); renderGraph(); };
function updatePositions() {
    g.selectAll(".link").attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    g.selectAll(".node").attr("transform", d => `translate(${d.x},${d.y})`);
}
function dragStart(e) { if (!e.active && simulation) simulation.alphaTarget(0.3).restart(); e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; }
function dragging(e) { e.subject.fx = e.x; e.subject.fy = e.y; }
function dragEnd(e) { if (!e.active && simulation) simulation.alphaTarget(0); e.subject.fx = null; e.subject.fy = null; }
document.querySelector('.close-modal').onclick = () => document.getElementById('profileModal').classList.remove('active');
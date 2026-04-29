const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLsYHGO0lvQdxVywXS-F7io9Vw2bhpADxTI4nfuf0PdoZh4hVwKPKS0iKTmKycX2WsldvuPur2e58O/pub?output=csv";

let globalData = [];
let simulation, svg, g;
let currentView = 'force'; 
let highlightedNodes = new Set();
let highlightedLinks = new Set();

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
    renderGraph();
    setupSearch();
}).catch(err => console.error("Ошибка:", err));

function renderGraph() {
    const width = window.innerWidth, height = window.innerHeight;
    d3.select("#treeCanvas").selectAll("g").remove(); 
    
    svg = d3.select("#treeCanvas")
        .attr("width", width).attr("height", height)
        .call(d3.zoom().scaleExtent([0.05, 3]).on("zoom", (e) => g.attr("transform", e.transform)));

    g = svg.append("g");

    const links = globalData
        .filter(d => d.fatherId !== null && globalData.find(f => f.id === d.fatherId))
        .map(d => ({ source: d.fatherId, target: d.id }));

    if (currentView === 'force') {
        runForceLayout(globalData, links);
    } else {
        runTreeLayout(globalData, links);
    }
}

function runForceLayout(data, links) {
    simulation = d3.forceSimulation(data)
        .force("link", d3.forceLink(links).id(d => d.id).distance(160))
        .force("charge", d3.forceManyBody().strength(-1200))
        .force("center", d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2))
        .force("collision", d3.forceCollide().radius(80));

    drawGraphElements(data, links);
    simulation.on("tick", updatePositions);
}

function runTreeLayout(data, links) {
    try {
        const stratify = d3.stratify().id(d => d.id).parentId(d => d.fatherId);
        const root = stratify(data);
        const treeLayout = d3.tree().nodeSize([120, 280]);
        treeLayout(root);

        const nodes = root.descendants();
        const tLinks = root.links();

        nodes.forEach(d => {
            d.x = d.y + 150; 
            d.y = d.x_orig = d.x; // Временное для совместимости
            d.y = d.x + (window.innerHeight / 4);
            d.x = d.y_orig = d.y; // Центрируем
            // Корректное смещение
            const temp = d.x; d.x = d.y; d.y = temp;
        });

        drawGraphElements(nodes.map(d => ({...d.data, x: d.x, y: d.y})), 
                          tLinks.map(l => ({
                              source: {...l.source.data, x: l.source.x, y: l.source.y}, 
                              target: {...l.target.data, x: l.target.x, y: l.target.y}
                          })));
        updatePositions();
    } catch (e) {
        console.error(e);
        alert("Дерево қатесі: Түп атаны анықтау мүмкін емес.");
        currentView = 'force'; renderGraph();
    }
}

function drawGraphElements(nodes, links) {
    const link = g.append("g").selectAll("line").data(links).enter().append("line")
        .attr("class", "link").attr("marker-end", "url(#arrowhead)");

    const node = g.append("g").selectAll(".node").data(nodes).enter().append("g")
        .attr("class", "node")
        .on("click", (e, d) => showProfile(d))
        .call(d3.drag().on("start", dragStart).on("drag", dragging).on("end", dragEnd));

    node.append("circle").attr("r", 32).attr("fill", "#fff").attr("stroke", "#0071e3").attr("stroke-width", 2);
    node.append("clipPath").attr("id", d => `clip-${d.id}`).append("circle").attr("r", 30);

    node.append("image")
        .attr("xlink:href", d => (d.photo && d.photo.length > 5) ? d.photo : "https://cdn-icons-png.flaticon.com/512/3135/3135715.png")
        .attr("x", -30).attr("y", -30).attr("width", 60).attr("height", 60)
        .attr("clip-path", d => `url(#clip-${d.id})`).attr("preserveAspectRatio", "xMidYMid slice");

    node.append("text").attr("dy", 50).attr("text-anchor", "middle").text(d => d.name);
}

function showProfile(person) {
    const modal = document.getElementById('profileModal');
    const father = globalData.find(p => p.id === person.fatherId);
    
    document.getElementById('p-patronymic').innerText = father ? `${father.name} ұлы` : "";
    document.getElementById('p-full-name').innerText = person.name;
    document.getElementById('p-birth').innerText = person.birth ? `Туылды: ${person.birth}` : "";
    document.getElementById('p-death').innerText = person.death ? `Қайтты: ${person.death}` : "";
    
    const phoneLink = document.getElementById('p-phone-link');
    if (person.phone && person.phone.trim() !== "") {
        phoneLink.innerText = `Тел: ${person.phone}`;
        phoneLink.href = `tel:${person.phone.replace(/\D/g, '')}`;
        phoneLink.style.display = 'block';
    } else { phoneLink.style.display = 'none'; }

    const img = document.getElementById('p-photo'), placeholder = document.getElementById('p-avatar-placeholder');
    if (person.photo && person.photo.length > 5) {
        img.src = person.photo; img.style.display = 'block'; placeholder.style.display = 'none';
    } else { img.style.display = 'none'; placeholder.style.display = 'block'; }

    renderLineage(person);
    modal.classList.add('active');
}

function renderLineage(person) {
    const ancCont = document.getElementById('p-ancestors'), descCont = document.getElementById('p-descendants');
    const ancestors = []; let curr = person;
    while(curr && curr.fatherId) {
        curr = globalData.find(p => p.id === curr.fatherId);
        if(curr) ancestors.push(curr);
    }
    
    ancCont.innerHTML = "";
    ancestors.reverse().forEach((anc, i) => {
        const span = document.createElement('span');
        span.className = 'lineage-pill';
        span.innerText = anc.name;
        span.onclick = () => showProfile(anc);
        ancCont.appendChild(span);
        if (i < ancestors.length - 1) {
            const arrow = document.createElement('span');
            arrow.className = 'lineage-arrow';
            arrow.innerText = '→';
            ancCont.appendChild(arrow);
        }
    });

    const children = globalData.filter(p => p.fatherId === person.id);
    descCont.innerHTML = "";
    children.forEach(child => {
        const span = document.createElement('span');
        span.className = 'lineage-pill';
        span.innerText = child.name;
        span.onclick = () => showProfile(child);
        descCont.appendChild(span);
    });
}

function setupSearch() {
    const input = document.getElementById('memberSearch'), results = document.getElementById('searchResults');
    input.oninput = function() {
        const val = this.value.toLowerCase();
        results.innerHTML = "";
        if (val.length < 2) { results.classList.remove('active'); return; }
        
        globalData.filter(p => p.name.toLowerCase().includes(val)).forEach(p => {
            const father = globalData.find(f => f.id === p.fatherId);
            const div = document.createElement('div');
            div.className = 'search-item';
            div.innerHTML = `<strong>${p.name}</strong><small>${father ? father.name+' ұлы' : ''} | ${p.birth}</small>`;
            div.onclick = () => { showProfile(p); results.classList.remove('active'); input.value = ""; };
            results.appendChild(div);
        });
        results.classList.add('active');
    };
}

function updatePositions() {
    g.selectAll(".link").attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    g.selectAll(".node").attr("transform", d => `translate(${d.x},${d.y})`);
}

document.getElementById('viewFilter').onclick = () => { currentView = (currentView === 'force' ? 'tree' : 'force'); renderGraph(); };
document.querySelector('.close-modal').onclick = () => document.getElementById('profileModal').classList.remove('active');
function dragStart(e) { if (!e.active && simulation) simulation.alphaTarget(0.3).restart(); e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; }
function dragging(e) { e.subject.fx = e.x; e.subject.fy = e.y; }
function dragEnd(e) { if (!e.active && simulation) simulation.alphaTarget(0); e.subject.fx = null; e.subject.fy = null; }
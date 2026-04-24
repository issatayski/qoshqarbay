// Замените на вашу ссылку CSV
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLsYHGO0lvQdxVywXS-F7io9Vw2bhpADxTI4nfuf0PdoZh4hVwKPKS0iKTmKycX2WsldvuPur2e58O/pub?output=csv";

let globalData = [];

// 1. Загрузка данных
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
    initGraph(globalData);
});

function initGraph(data) {
    const width = window.innerWidth;
    const height = window.innerHeight;

    const links = data.filter(d => d.fatherId).map(d => ({ source: d.fatherId, target: d.id }));

    const svg = d3.select("#treeCanvas")
        .attr("width", width)
        .attr("height", height)
        .call(d3.zoom().scaleExtent([0.2, 3]).on("zoom", (e) => g.attr("transform", e.transform)));

    const g = svg.append("g");

    const simulation = d3.forceSimulation(data)
        .force("link", d3.forceLink(links).id(d => d.id).distance(150))
        .force("charge", d3.forceManyBody().strength(-1200))
        .force("center", d3.forceCenter(width / 2, height / 2));

    const link = g.append("g").selectAll("line").data(links).enter().append("line").attr("class", "link");

    const node = g.append("g").selectAll(".node").data(data).enter().append("g")
        .attr("class", "node")
        .on("click", (e, d) => showProfile(d))
        .call(d3.drag().on("start", dragStart).on("drag", dragging).on("end", dragEnd));

    node.append("circle").attr("r", 30).attr("fill", "white").attr("stroke", "#0071e3").attr("stroke-width", 2);
    node.append("text").attr("dy", 50).attr("text-anchor", "middle").text(d => d.name).style("font-size", "12px");

    simulation.on("tick", () => {
        link.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
        node.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    document.getElementById('searchBtn').onclick = () => {
        const val = document.getElementById('memberSearch').value.toLowerCase();
        const found = data.find(p => p.name.toLowerCase().includes(val));
        if (found) showProfile(found);
    };
}

// 2. Логика построения цепочки (Шежіре)
function getAncestors(person, list = []) {
    const father = globalData.find(p => p.id === person.fatherId);
    if (father) {
        list.push(father);
        return getAncestors(father, list);
    }
    return list;
}

function showProfile(person) {
    const modal = document.getElementById('profileModal');
    
    // Основное
    document.getElementById('p-name').innerText = person.name;
    document.getElementById('p-birth-badge').innerText = `род. ${person.birth}`;
    document.getElementById('p-contact').innerText = person.phone;

    // Смерть
    const deathBadge = document.getElementById('p-death-badge');
    if (person.death) {
        deathBadge.innerText = `ум. ${person.death}`;
        deathBadge.style.display = 'inline-block';
    } else {
        deathBadge.style.display = 'none';
    }

    // Фото
    const img = document.getElementById('p-photo');
    const placeholder = document.getElementById('p-avatar-placeholder');
    if (person.photo) { img.src = person.photo; img.style.display = 'block'; placeholder.style.display = 'none'; }
    else { img.style.display = 'none'; placeholder.style.display = 'block'; }

    // ЦЕПОЧКА ПРЕДКОВ (ВВЕРХ)
    const ancestors = getAncestors(person).reverse(); // От прадеда к отцу
    const ancContainer = document.getElementById('p-ancestors');
    ancContainer.innerHTML = ancestors.length ? "" : "<p>Первый предок</p>";
    ancestors.forEach(anc => {
        const div = document.createElement('div');
        div.className = 'lineage-item ancestor';
        div.innerText = anc.name;
        div.onclick = () => showProfile(anc);
        ancContainer.appendChild(div);
    });

    // СПИСОК ДЕТЕЙ (ВНИЗ)
    const children = globalData.filter(p => p.fatherId === person.id);
    const descContainer = document.getElementById('p-descendants');
    descContainer.innerHTML = children.length ? "" : "<p>Нет потомков по мужской линии</p>";
    children.forEach(child => {
        const div = document.createElement('div');
        div.className = 'lineage-item descendant';
        div.innerText = child.name;
        div.onclick = () => showProfile(child);
        descContainer.appendChild(div);
    });

    modal.classList.add('active');
}

// UI Helpers
document.querySelector('.close-modal').onclick = () => document.getElementById('profileModal').classList.remove('active');
function dragStart(e) { if (!e.active) simulation.alphaTarget(0.3).restart(); e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; }
function dragging(e) { e.subject.fx = e.x; e.subject.fy = e.y; }
function dragEnd(e) { if (!e.active) simulation.alphaTarget(0); e.subject.fx = null; e.subject.fy = null; }
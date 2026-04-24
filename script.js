// Замените на вашу ссылку CSV
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLsYHGO0lvQdxVywXS-F7io9Vw2bhpADxTI4nfuf0PdoZh4hVwKPKS0iKTmKycX2WsldvuPur2e58O/pub?output=csv";

let globalData = [];
let simulation;

// Загрузка данных
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
}).catch(err => console.error("Ошибка загрузки данных:", err));

function initGraph(data) {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Создание связей (только если отец существует в базе)
    const links = data
        .filter(d => d.fatherId && data.find(p => p.id === d.fatherId))
        .map(d => ({ source: d.fatherId, target: d.id }));

    const svg = d3.select("#treeCanvas")
        .attr("width", width)
        .attr("height", height)
        .call(d3.zoom().scaleExtent([0.1, 3]).on("zoom", (e) => g.attr("transform", e.transform)));

    const g = svg.append("g");

    // Физика графа
    simulation = d3.forceSimulation(data)
        .force("link", d3.forceLink(links).id(d => d.id).distance(120))
        .force("charge", d3.forceManyBody().strength(-1500))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(70));

    const link = g.append("g").selectAll("line").data(links).enter().append("line").attr("class", "link");

    const node = g.append("g").selectAll(".node").data(data).enter().append("g")
        .attr("class", "node")
        .on("click", (e, d) => showProfile(d))
        .call(d3.drag().on("start", dragStart).on("drag", dragging).on("end", dragEnd));

    node.append("circle").attr("r", 30).attr("fill", "#fff").attr("stroke", "#0071e3").attr("stroke-width", 2);
    node.append("text").attr("dy", 50).attr("text-anchor", "middle").text(d => d.name);

    simulation.on("tick", () => {
        link.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
        node.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    // Поиск
    document.getElementById('searchBtn').onclick = () => {
        const val = document.getElementById('memberSearch').value.toLowerCase();
        const found = data.find(p => p.name.toLowerCase().includes(val));
        if (found) showProfile(found);
    };
}

// РЕКУРСИЯ: Поиск всех отцов вверх
function getAncestors(person, list = []) {
    if (!person.fatherId) return list;
    const father = globalData.find(p => p.id === person.fatherId);
    if (father) {
        list.push(father);
        return getAncestors(father, list);
    }
    return list;
}

// ОТКРЫТИЕ ПРОФИЛЯ
function showProfile(person) {
    const modal = document.getElementById('profileModal');
    
    // Формируем Имя (Отец + ұлы + Имя)
    const father = globalData.find(p => p.id === person.fatherId);
    const fullNameElement = document.getElementById('p-full-name');
    if (father) {
        const fatherFirstName = father.name.split(' ')[0];
        fullNameElement.innerText = `${fatherFirstName} ұлы ${person.name}`;
    } else {
        fullNameElement.innerText = person.name;
    }

    // Даты и Телефон
    document.getElementById('p-birth').innerText = `род. ${person.birth}`;
    const deathElem = document.getElementById('p-death');
    if (person.death) {
        deathElem.innerText = ` — ум. ${person.death}`;
        deathElem.style.display = 'inline';
    } else {
        deathElem.style.display = 'none';
    }

    const phoneLink = document.getElementById('p-phone-link');
    if (person.phone && person.phone !== "—") {
        phoneLink.innerText = person.phone;
        phoneLink.href = `tel:${person.phone.replace(/\D/g, '')}`;
        phoneLink.style.display = 'block';
    } else {
        phoneLink.style.display = 'none';
    }

    // Фото
    const img = document.getElementById('p-photo');
    const placeholder = document.getElementById('p-avatar-placeholder');
    if (person.photo && person.photo.length > 5) {
        img.src = person.photo; img.style.display = 'block'; placeholder.style.display = 'none';
    } else {
        img.style.display = 'none'; placeholder.style.display = 'block';
    }

    // Рендер Предков (Шежіре вверх)
    const ancestors = getAncestors(person).reverse();
    const ancCont = document.getElementById('p-ancestors');
    ancCont.innerHTML = ancestors.length ? "" : "<p style='color:#86868b'>Основатель рода</p>";
    ancestors.forEach(anc => {
        const div = document.createElement('div');
        div.className = 'lineage-item';
        div.innerText = `↑ ${anc.name}`;
        div.onclick = (e) => { e.stopPropagation(); showProfile(anc); };
        ancCont.appendChild(div);
    });

    // Рендер Потомков (Вниз)
    const children = globalData.filter(p => p.fatherId === person.id);
    const descCont = document.getElementById('p-descendants');
    descCont.innerHTML = children.length ? "" : "<p style='color:#86868b'>Нет данных о сыновьях</p>";
    children.forEach(child => {
        const div = document.createElement('div');
        div.className = 'lineage-item';
        div.innerText = `↳ ${child.name}`;
        div.onclick = (e) => { e.stopPropagation(); showProfile(child); };
        descCont.appendChild(div);
    });

    modal.classList.add('active');
}

// Закрытие и Drag
document.querySelector('.close-modal').onclick = () => document.getElementById('profileModal').classList.remove('active');
function dragStart(e) { if (!e.active) simulation.alphaTarget(0.3).restart(); e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; }
function dragging(e) { e.subject.fx = e.x; e.subject.fy = e.y; }
function dragEnd(e) { if (!e.active) simulation.alphaTarget(0); e.subject.fx = null; e.subject.fy = null; }
// 1. Ссылка на вашу таблицу
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSLsYHGO0lvQdxVywXS-F7io9Vw2bhpADxTI4nfuf0PdoZh4hVwKPKS0iKTmKycX2WsldvuPur2e58O/pub?output=csv";

let globalData = [];
let simulation;
let svg, g; // Переменные для доступа к графике из любой функции

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

    const links = data
        .filter(d => d.fatherId && data.find(p => p.id === d.fatherId))
        .map(d => ({ source: d.fatherId, target: d.id }));

    svg = d3.select("#treeCanvas")
        .attr("width", width)
        .attr("height", height)
        .call(d3.zoom().scaleExtent([0.1, 3]).on("zoom", (e) => g.attr("transform", e.transform)));

    g = svg.append("g");

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

    setupSearch();
}

// Вынес поиск в отдельную функцию, чтобы не путать с графикой
function setupSearch() {
    const searchInput = document.getElementById('memberSearch');
    const searchResults = document.getElementById('searchResults');

    searchInput.oninput = function() {
        const val = this.value.toLowerCase();
        searchResults.innerHTML = "";
        if (val.length < 2) {
            searchResults.classList.remove('active');
            return;
        }

        const matches = globalData.filter(p => p.name.toLowerCase().includes(val));
        if (matches.length > 0) {
            searchResults.classList.add('active');
            matches.forEach(person => {
                const div = document.createElement('div');
                div.className = 'search-item';
                const father = globalData.find(f => f.id === person.fatherId);
                const fatherNote = father ? `${father.name.split(' ')[0]}ұлы` : "Основатель";
                div.innerHTML = `<strong>${person.name}</strong><span class="sub-name">${fatherNote} | род: ${person.birth}</span>`;
                div.onclick = () => {
                    showProfile(person);
                    searchResults.classList.remove('active');
                    searchInput.value = person.name;
                };
                searchResults.appendChild(div);
            });
        } else {
            searchResults.classList.remove('active');
        }
    };

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.input-wrapper')) searchResults.classList.remove('active');
    });

    document.getElementById('searchBtn').onclick = () => {
        const val = searchInput.value.toLowerCase();
        const found = globalData.find(p => p.name.toLowerCase().includes(val));
        if (found) showProfile(found);
    };
}

function getAncestors(person, list = []) {
    if (!person.fatherId) return list;
    const father = globalData.find(p => p.id === person.fatherId);
    if (father) {
        list.push(father);
        return getAncestors(father, list);
    }
    return list;
}

function showProfile(person) {
    const modal = document.getElementById('profileModal');
    
    // Формирование имени "ұлы"
    const father = globalData.find(p => p.id === person.fatherId);
    const fullNameElement = document.getElementById('p-full-name');
    if (father) {
        const fatherFirstName = father.name.split(' ')[0];
        fullNameElement.innerText = `${fatherFirstName}ұлы ${person.name}`;
    } else {
        fullNameElement.innerText = person.name;
    }

    // ЛОГИКА ПЕРЕХОДА К КАРТЕ ПРИ КЛИКЕ НА ШАПКУ
    const infoSide = document.querySelector('.info-side');
    infoSide.onclick = () => {
        modal.classList.remove('active'); // Закрыть профиль
        
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        // Плавный подлет камеры к человеку
        svg.transition().duration(1000).call(
            d3.zoom().transform, 
            d3.zoomIdentity.translate(width/2 - person.x * 1.5, height/2 - person.y * 1.5).scale(1.5)
        );

        highlightNode(person.id); // Подсветить зеленым
    };

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

    // Рендер Предков
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

    // Рендер Потомков (Сортировка по возрастанию ID)
    const children = globalData
        .filter(p => p.fatherId === person.id)
        .sort((a, b) => a.id - b.id);

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

function highlightNode(nodeId) {
    d3.selectAll(".node circle").transition().attr("stroke", "#0071e3").attr("stroke-width", 2);
    d3.selectAll(".node text").transition().style("fill", "#333").style("font-weight", "500");

    const targetNode = d3.selectAll(".node").filter(d => d.id === nodeId);
    targetNode.select("circle").transition().duration(500).attr("stroke", "#28a745").attr("stroke-width", 8);
    targetNode.select("text").transition().duration(500).style("fill", "#28a745").style("font-weight", "bold");
    
    setTimeout(() => {
        targetNode.select("circle").transition().duration(1000).attr("stroke", "#0071e3").attr("stroke-width", 2);
        targetNode.select("text").transition().duration(1000).style("fill", "#333").style("font-weight", "500");
    }, 3000);
}

document.querySelector('.close-modal').onclick = () => document.getElementById('profileModal').classList.remove('active');
function dragStart(e) { if (!e.active) simulation.alphaTarget(0.3).restart(); e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; }
function dragging(e) { e.subject.fx = e.x; e.subject.fy = e.y; }
function dragEnd(e) { if (!e.active) simulation.alphaTarget(0); e.subject.fx = null; e.subject.fy = null; }
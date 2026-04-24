// Рыба данных (сюда же можно подключить d3.csv для Google Sheets)
const familyData = [
    { id: 1, name: "Иван Иванов", birth: "12.05.1970", death: null, photo: "https://i.pravatar.cc/150?u=1", phone: "+7 (777) 111", parents: [3], children: [] },
    { id: 3, name: "Александр Иванов", birth: "01.01.1940", death: "15.03.2010", photo: "https://i.pravatar.cc/150?u=3", phone: "-", parents: [], children: [1] }
];

const width = window.innerWidth;
const height = window.innerHeight;

const svg = d3.select("#treeCanvas")
    .attr("width", width)
    .attr("height", height)
    .call(d3.zoom().scaleExtent([0.5, 3]).on("zoom", (event) => g.attr("transform", event.transform)));

const g = svg.append("g");

// Связи
const links = [];
familyData.forEach(p => p.children.forEach(cId => links.push({ source: p.id, target: cId })));

const simulation = d3.forceSimulation(familyData)
    .force("link", d3.forceLink(links).id(d => d.id).distance(180))
    .force("charge", d3.forceManyBody().strength(-800))
    .force("center", d3.forceCenter(width / 2, height / 2));

const link = g.append("g").selectAll("line").data(links).enter().append("line")
    .attr("stroke", "#d2d2d7").attr("stroke-width", 2);

const node = g.append("g").selectAll(".node").data(familyData).enter().append("g")
    .attr("class", "node")
    .on("click", (e, d) => showProfile(d))
    .call(d3.drag().on("start", dragStart).on("drag", dragging).on("end", dragEnd));

node.append("circle").attr("r", 35).attr("fill", "white").attr("stroke", "#0071e3").attr("stroke-width", 2);
node.append("text").attr("dy", 55).attr("text-anchor", "middle").text(d => d.name).style("font-size", "13px");

simulation.on("tick", () => {
    link.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    node.attr("transform", d => `translate(${d.x},${d.y})`);
});

// ЛОГИКА ПРОФИЛЯ
function showProfile(person) {
    const modal = document.getElementById('profileModal');
    
    // Имя и Даты
    document.getElementById('p-name').innerText = person.name;
    document.getElementById('p-birth').innerText = person.birth;
    document.getElementById('p-contact').innerText = person.phone;

    // Логика даты смерти
    const deathRow = document.getElementById('death-row');
    if (person.death) {
        deathRow.style.display = 'flex';
        document.getElementById('p-death').innerText = person.death;
    } else {
        deathRow.style.display = 'none';
    }

    // Фото (Аватар из таблицы)
    const img = document.getElementById('p-photo');
    const placeholder = document.getElementById('p-avatar-placeholder');
    if (person.photo && person.photo !== "") {
        img.src = person.photo;
        img.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        img.style.display = 'none';
        placeholder.style.display = 'block';
    }

    modal.classList.add('active');
    
    // Центрирование камеры
    svg.transition().duration(800).call(
        d3.zoom().transform, 
        d3.zoomIdentity.translate(width/2 - person.x, height/2 - person.y).scale(1.2)
    );
}

// ЛОГИКА ПОИСКА ПО КНОПКЕ
document.getElementById('searchBtn').onclick = function() {
    const query = document.getElementById('memberSearch').value.toLowerCase();
    const found = familyData.find(p => p.name.toLowerCase().includes(query));
    if(found) showProfile(found);
    else alert("Родственник не найден");
};

// Закрытие
document.querySelector('.close-modal').onclick = () => document.getElementById('profileModal').classList.remove('active');

// Технические функции Drag
function dragStart(event) { if (!event.active) simulation.alphaTarget(0.3).restart(); event.subject.fx = event.subject.x; event.subject.fy = event.subject.y; }
function dragging(event) { event.subject.fx = event.x; event.subject.fy = event.y; }
function dragEnd(event) { if (!event.active) simulation.alphaTarget(0); event.subject.fx = null; event.subject.fy = null; }
// 1. Данные ("Рыба")
const familyData = [
    { id: 1, name: "Иван Иванов", birth: "1985", phone: "+7 (777) 123-45-67", parents: [3, 4], spouse: [2], children: [5], photo: "" },
    { id: 2, name: "Мария Иванова", birth: "1988", phone: "+7 (777) 987-65-43", parents: [], spouse: [1], children: [5], photo: "" },
    { id: 3, name: "Александр Иванов", birth: "1960", phone: "-", parents: [], spouse: [4], children: [1], photo: "" },
    { id: 4, name: "Елена Иванова", birth: "1962", phone: "-", parents: [], spouse: [3], children: [1], photo: "" },
    { id: 5, name: "Дмитрий Иванов", birth: "2015", phone: "нет", parents: [1, 2], spouse: [], children: [], photo: "" }
];

// 2. Инициализация D3 Canvas
const width = window.innerWidth;
const height = window.innerHeight;
const svg = d3.select("#treeCanvas")
    .attr("width", width)
    .attr("height", height)
    .call(d3.zoom().on("zoom", (event) => {
        g.attr("transform", event.transform);
    }));

const g = svg.append("g"); // Группа для всех элементов

// Генерация связей для графа
const links = [];
familyData.forEach(person => {
    person.children.forEach(childId => {
        links.push({ source: person.id, target: childId });
    });
});

// Симуляция физики
const simulation = d3.forceSimulation(familyData)
    .force("link", d3.forceLink(links).id(d => d.id).distance(150))
    .force("charge", d3.forceManyBody().strength(-500))
    .force("center", d3.forceCenter(width / 2, height / 2));

// Отрисовка
const link = g.append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(links)
    .enter().append("line")
    .attr("class", "link");

const node = g.append("g")
    .attr("class", "nodes")
    .selectAll(".node")
    .data(familyData)
    .enter().append("g")
    .attr("class", "node")
    .on("click", (event, d) => showProfile(d))
    .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

node.append("circle").attr("r", 30);
node.append("text")
    .attr("dy", 45)
    .attr("text-anchor", "middle")
    .text(d => d.name);

simulation.on("tick", () => {
    link.attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

    node.attr("transform", d => `translate(${d.x},${d.y})`);
});

// Функции UI
function showProfile(person) {
    const modal = document.getElementById('profileModal');
    document.getElementById('p-name').innerText = person.name;
    document.getElementById('p-dates').innerText = `${person.birth} — ...`;
    document.getElementById('p-contact').innerText = person.phone;
    
    modal.classList.add('active');
    
    // Плавное центрирование на узле
    svg.transition().duration(750).call(
        d3.zoom().transform, 
        d3.zoomIdentity.translate(width/2 - person.x, height/2 - person.y).scale(1.2)
    );
}

document.querySelector('.close-modal').onclick = () => {
    document.getElementById('profileModal').classList.remove('active');
};

// Поиск
document.getElementById('memberSearch').oninput = function(e) {
    const val = e.target.value.toLowerCase();
    const results = familyData.filter(p => p.name.toLowerCase().includes(val));
    // Тут можно отрисовать dropdown, для прототипа — авто-фокус первого совпадения
    if(results.length > 0 && val.length > 2) {
        showProfile(results[0]);
    }
};

// Drag functions
function dragstarted(event) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  event.subject.fx = event.subject.x;
  event.subject.fy = event.subject.y;
}
function dragged(event) {
  event.subject.fx = event.x;
  event.subject.fy = event.y;
}
function dragended(event) {
  if (!event.active) simulation.alphaTarget(0);
  event.subject.fx = null;
  event.subject.fy = null;
}
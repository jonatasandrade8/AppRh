import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, addDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// CONFIG
const firebaseConfig = {
    apiKey: "AIzaSyBLxhi9yn506R-kjlOoMz7R_i7C7c5iRjs",
    authDomain: "apprh-db10f.firebaseapp.com",
    projectId: "apprh-db10f",
    storageBucket: "apprh-db10f.firebasestorage.app",
    messagingSenderId: "1086403355974",
    appId: "1:1086403355974:web:9b31c7cc2f5d4411a27147",
    measurementId: "G-2L7PFCGDRM"
};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'rh-enterprise-v3';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const getColl = (c) => collection(db, 'artifacts', appId, 'public', 'data', c);

// STATE
let company = {}, struct = { roles:[], holidays:[], networks:[], stores:[], states:[] };
let employees = [], currentManager = null;

// INIT
async function init() {
    if(typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token);
    else await signInAnonymously(auth);

    onAuthStateChanged(auth, async (u) => {
        if(u) {
            await Promise.all([loadCompany(), loadStruct()]);
            
            // Admin Flow
            const admins = await getDocs(getColl('admins'));
            if(admins.empty) await addDoc(getColl('admins'), {user:'admin', pass:'123456'});
            document.getElementById('login-screen').classList.remove('hidden');
            document.getElementById('login-screen').classList.add('flex');
        }
    });
}

// --- DATA LOADERS ---
async function loadCompany() {
    const snap = await getDocs(getColl('config'));
    company = snap.empty ? {nome:'Minha Empresa', logo:''} : {id:snap.docs[0].id, ...snap.docs[0].data()};
}

async function loadStruct() {
    const load = async (k) => {
        const s = await getDocs(getColl(k));
        struct[k] = s.docs.map(d=>({id:d.id, ...d.data()}));
    };
    await Promise.all(['roles','holidays','networks','stores','states'].map(load));
}

// --- ADMIN AUTH ---
document.getElementById('form-login').onsubmit = async (e) => {
    e.preventDefault();
    const u = document.getElementById('login-user').value;
    const p = document.getElementById('login-pass').value;
    
    // Validação de entrada
    if(!u || !p) {
        document.getElementById('login-msg').innerText = "Preencha todos os campos";
        document.getElementById('login-msg').classList.remove('hidden');
        return;
    }
    
    const q = query(getColl('admins'), where('user','==',u), where('pass','==',p));
    const snap = await getDocs(q);
    
    if(!snap.empty) {
        currentManager = {id: snap.docs[0].id, ...snap.docs[0].data()};
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('sidebar').classList.remove('hidden');
        document.getElementById('sidebar').classList.add('flex');
        router('dashboard');
    } else {
        document.getElementById('login-msg').innerText = "Credenciais inválidas";
        document.getElementById('login-msg').classList.remove('hidden');
    }
};

// --- ROUTER ---
window.router = async (view) => {
    const el = document.getElementById('app-content');
    el.innerHTML = '<div class="flex justify-center mt-20"><div class="loader"></div></div>';
    if(window.innerWidth < 768) document.getElementById('sidebar').classList.add('hidden');
    
    switch(view) {
        case 'dashboard': await renderDashboard(el); break;
        case 'rh': await renderRH(el); break;
        case 'relatorios': await renderReports(el); break;
        case 'config-company': renderConfigCompany(el); break;
        case 'config-struct': renderConfigStruct(el); break;
        case 'links': renderLinks(el); break;
    }
};

// --- MOBILE SIDEBAR ---
window.toggleMobileSidebar = () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('hidden');
    sidebar.classList.toggle('absolute');
    sidebar.classList.toggle('h-full');
};

// --- LOGOUT ---
window.logoutManager = () => {
    currentManager = null;
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('login-screen').classList.add('flex');
    document.getElementById('sidebar').classList.add('hidden');
    document.getElementById('sidebar').classList.remove('flex');
    document.getElementById('login-user').value = '';
    document.getElementById('login-pass').value = '';
    document.getElementById('login-msg').classList.add('hidden');
};

// --- MODULES ---

// 1. DASHBOARD
async function renderDashboard(el) {
    const snap = await getDocs(getColl('employees'));
    const total = snap.size;
    
    // Dados para aniversariantes
    const today = new Date();
    const currentMonth = today.getMonth();
    const aniversariantes = snap.docs.map(d => ({id:d.id, ...d.data()})).filter(e => {
        if(!e.dataNascimento) return false;
        const birthDate = new Date(e.dataNascimento);
        return birthDate.getMonth() === currentMonth;
    });
    
    el.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div class="bg-white p-6 rounded shadow border-l-4 border-blue-500 hover:shadow-lg transition">
                <h3 class="text-gray-500 text-sm font-bold uppercase">Total Colaboradores</h3>
                <p class="text-3xl font-bold text-slate-800 mt-2">${total}</p>
            </div>
            <div class="bg-white p-6 rounded shadow border-l-4 border-green-500 hover:shadow-lg transition">
                <h3 class="text-gray-500 text-sm font-bold uppercase">Lojas Cadastradas</h3>
                <p class="text-3xl font-bold text-slate-800 mt-2">${struct.stores.length}</p>
            </div>
            <div class="bg-white p-6 rounded shadow border-l-4 border-purple-500 hover:shadow-lg transition">
                <h3 class="text-gray-500 text-sm font-bold uppercase">Redes</h3>
                <p class="text-3xl font-bold text-slate-800 mt-2">${struct.networks.length}</p>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-white p-6 rounded shadow">
                <h3 class="font-bold text-lg mb-4 flex items-center gap-2"><i class="fa-solid fa-birthday-cake text-orange-500"></i> Aniversariantes do Mês</h3>
                ${aniversariantes.length > 0 ? `
                    <ul class="space-y-2">
                        ${aniversariantes.map(e => {
                            const birthDate = new Date(e.dataNascimento);
                            const day = birthDate.getDate();
                            const month = birthDate.toLocaleDateString('pt-BR', {month: 'long'});
                            return `<li class="flex justify-between items-center p-3 bg-orange-50 rounded border-l-4 border-orange-400">
                                <span class="font-medium">${e.nomeCompleto}</span>
                                <span class="text-sm text-gray-500">${day} de ${month}</span>
                            </li>`;
                        }).join('')}
                    </ul>
                ` : '<p class="text-gray-500 italic">Nenhum aniversariante este mês</p>'}
            </div>

            <div class="bg-white p-6 rounded shadow">
                <h3 class="font-bold text-lg mb-4 flex items-center gap-2"><i class="fa-solid fa-chart-pie text-blue-500"></i> Acesso Rápido</h3>
                <div class="space-y-2">
                    <button onclick="router('rh')" class="w-full bg-blue-100 text-blue-700 px-4 py-3 rounded hover:bg-blue-200 transition text-left flex items-center gap-2">
                        <i class="fa-solid fa-users"></i> Gerenciar Equipe
                    </button>
                    <button onclick="router('relatorios')" class="w-full bg-green-100 text-green-700 px-4 py-3 rounded hover:bg-green-200 transition text-left flex items-center gap-2">
                        <i class="fa-solid fa-file-contract"></i> Gerar Relatórios
                    </button>
                    <button onclick="router('config-struct')" class="w-full bg-purple-100 text-purple-700 px-4 py-3 rounded hover:bg-purple-200 transition text-left flex items-center gap-2">
                        <i class="fa-solid fa-network-wired"></i> Configurar Estrutura
                    </button>
                </div>
            </div>
        </div>
    `;
}

// 2. CONFIG COMPANY (LOGO FILE)
function renderConfigCompany(el) {
    el.innerHTML = `
        <div class="bg-white p-6 rounded shadow max-w-2xl mx-auto">
            <h2 class="text-xl font-bold mb-6 flex items-center gap-2"><i class="fa-solid fa-building text-blue-600"></i> Dados da Empresa</h2>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-bold mb-1">Razão Social</label>
                    <input id="c-nome" value="${company.nome||''}" class="w-full border p-3 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="Nome da Empresa">
                </div>
                <div>
                    <label class="block text-sm font-bold mb-1">CNPJ</label>
                    <input id="c-cnpj" value="${company.cnpj||''}" class="w-full border p-3 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="00.000.000/0000-00">
                </div>
                
                <div>
                    <label class="block text-sm font-bold mb-2">Logomarca</label>
                    <input type="file" id="c-logo-file" accept="image/*" class="w-full border p-2 rounded bg-gray-50 text-sm">
                    <p class="text-xs text-gray-500 mt-1"><i class="fa-solid fa-info-circle"></i> Recomendado: PNG/JPG até 100KB.</p>
                    ${company.logo ? `<img src="${company.logo}" class="h-20 mt-4 border p-2 rounded shadow">` : ''}
                </div>

                <button onclick="saveCompany()" class="w-full bg-blue-600 text-white px-6 py-3 rounded font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2">
                    <i class="fa-solid fa-save"></i> Salvar
                </button>
            </div>
        </div>
    `;
}

window.saveCompany = async () => {
    const file = document.getElementById('c-logo-file').files[0];
    let logoBase64 = company.logo || "";
    
    if(file) {
        if(file.size > 100000) return alert('Imagem muito grande! Use arquivo menor que 100KB.');
        logoBase64 = await new Promise(r => {
            const reader = new FileReader();
            reader.onload = () => r(reader.result);
            reader.readAsDataURL(file);
        });
    }

    const data = {
        nome: document.getElementById('c-nome').value,
        cnpj: document.getElementById('c-cnpj').value,
        logo: logoBase64
    };

    if(company.id) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', company.id), data);
    else await addDoc(getColl('config'), data);
    
    await loadCompany();
    alert('Salvo com sucesso!');
    router('config-company');
};

// 3. CONFIG STRUCTURE (TABS)
function renderConfigStruct(el) {
    el.innerHTML = `
        <div class="bg-white p-6 rounded shadow h-full flex flex-col">
            <h2 class="text-xl font-bold mb-6 flex items-center gap-2"><i class="fa-solid fa-network-wired text-blue-600"></i> Estrutura Operacional</h2>
            <div class="flex border-b mb-4 text-sm overflow-x-auto">
                <button onclick="openTab('tab-est')" class="px-4 py-2 border-b-2 border-blue-500 font-bold tab-btn whitespace-nowrap">Estados</button>
                <button onclick="openTab('tab-carg')" class="px-4 py-2 border-b-2 border-transparent hover:border-gray-300 tab-btn whitespace-nowrap">Cargos</button>
                <button onclick="openTab('tab-rede')" class="px-4 py-2 border-b-2 border-transparent hover:border-gray-300 tab-btn whitespace-nowrap">Redes & Lojas</button>
                <button onclick="openTab('tab-fer')" class="px-4 py-2 border-b-2 border-transparent hover:border-gray-300 tab-btn whitespace-nowrap">Feriados</button>
            </div>

            <div id="tab-est" class="tab-content">${renderSimpleCRUD('states', 'Estado (UF)', 'UF ex: SP, RJ')}</div>
            <div id="tab-carg" class="tab-content hidden">${renderSimpleCRUD('roles', 'Cargo', 'Nome do Cargo')}</div>
            <div id="tab-rede" class="tab-content hidden">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div><h4 class="font-bold text-sm mb-2 text-purple-600"><i class="fa-solid fa-network-wired"></i> Redes</h4>${renderSimpleCRUD('networks', 'Rede', 'Nome da Rede')}</div>
                    <div><h4 class="font-bold text-sm mb-2 text-green-600"><i class="fa-solid fa-store"></i> Lojas</h4>${renderStoreCRUD()}</div>
                </div>
            </div>
            <div id="tab-fer" class="tab-content hidden">${renderHolidayCRUD()}</div>
        </div>
    `;
}

window.openTab = (tid) => {
    document.querySelectorAll('.tab-content').forEach(d => d.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('border-blue-500','font-bold'); b.classList.add('border-transparent'); });
    document.getElementById(tid).classList.remove('hidden');
    event.target.classList.add('border-blue-500','font-bold');
    event.target.classList.remove('border-transparent');
}

// --- CRUD HELPERS ---
function renderSimpleCRUD(coll, label, ph) {
    const list = struct[coll].map(i => `
        <li class="flex justify-between bg-gray-50 p-3 rounded mb-2 text-sm hover:bg-gray-100 transition">
            <span>${i.name}</span>
            <button onclick="delStruct('${coll}','${i.id}')" class="text-red-500 hover:text-red-700 transition"><i class="fa-solid fa-trash"></i></button>
        </li>`).join('');
    return `
        <div class="flex gap-2 mb-3">
            <input id="new-${coll}" class="border p-2 rounded w-full text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="${ph}">
            <button onclick="addStruct('${coll}')" class="bg-blue-600 text-white px-4 rounded hover:bg-blue-700 transition"><i class="fa-solid fa-plus"></i></button>
        </div>
        <ul class="max-h-60 overflow-y-auto">${list}</ul>
    `;
}

function renderStoreCRUD() {
    const list = struct.stores.map(s => `
        <li class="flex justify-between bg-gray-50 p-3 rounded mb-2 text-sm hover:bg-gray-100 transition">
            <div><b>${s.name}</b> <span class="text-xs text-gray-500">(${s.network}) - ${s.city}/${s.state}</span></div>
            <button onclick="delStruct('stores','${s.id}')" class="text-red-500 hover:text-red-700 transition"><i class="fa-solid fa-trash"></i></button>
        </li>`).join('');
    return `
        <div class="space-y-2 mb-3 bg-gray-50 p-3 rounded border">
            <input id="store-name" class="border p-2 w-full text-sm rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="Nome Loja">
            <select id="store-net" class="border p-2 w-full text-sm rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"><option value="">Rede...</option>${struct.networks.map(n=>`<option>${n.name}</option>`).join('')}</select>
            <div class="flex gap-2">
                <select id="store-uf" class="border p-2 w-1/3 text-sm rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"><option value="">UF</option>${struct.states.map(s=>`<option>${s.name}</option>`).join('')}</select>
                <input id="store-city" class="border p-2 w-2/3 text-sm rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="Município">
            </div>
            <button onclick="addStore()" class="bg-green-600 text-white w-full py-2 rounded text-sm hover:bg-green-700 transition">Adicionar Loja</button>
        </div>
        <ul class="max-h-60 overflow-y-auto">${list}</ul>
    `;
}

function renderHolidayCRUD() {
    const list = struct.holidays.map(h => `
        <li class="flex justify-between bg-gray-50 p-3 rounded mb-2 text-sm border-l-4 ${h.type==='Nacional'?'border-red-500':'border-orange-400'} hover:bg-gray-100 transition">
            <div><b>${h.date}</b> - ${h.name} <span class="text-xs">(${h.type} ${h.scope||''})</span></div>
            <button onclick="delStruct('holidays','${h.id}')" class="text-red-500 hover:text-red-700 transition"><i class="fa-solid fa-trash"></i></button>
        </li>`).join('');
    return `
        <div class="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4 bg-gray-50 p-3 rounded items-end border">
            <div><label class="text-xs font-bold">Data</label><input type="date" id="hol-date" class="border p-2 w-full text-sm rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"></div>
            <div><label class="text-xs font-bold">Nome</label><input id="hol-name" class="border p-2 w-full text-sm rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"></div>
            <div><label class="text-xs font-bold">Tipo</label><select id="hol-type" class="border p-2 w-full text-sm rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"><option>Nacional</option><option>Estadual</option><option>Municipal</option></select></div>
            <div><label class="text-xs font-bold">Escopo (UF/Mun)</label><input id="hol-scope" class="border p-2 w-full text-sm rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="Ex: SP ou Campinas"></div>
        </div>
        <button onclick="addHoliday()" class="bg-blue-600 text-white px-4 py-2 rounded text-sm w-full mb-3 hover:bg-blue-700 transition">Salvar Feriado</button>
        <ul class="max-h-60 overflow-y-auto">${list}</ul>
    `;
}

window.addStruct = async (coll) => {
    const val = document.getElementById('new-'+coll).value;
    if(!val) return alert('Preencha o campo');
    await addDoc(getColl(coll), {name:val});
    await loadStruct(); router('config-struct');
};

window.addStore = async () => {
    const name = document.getElementById('store-name').value;
    const net = document.getElementById('store-net').value;
    const uf = document.getElementById('store-uf').value;
    const city = document.getElementById('store-city').value;
    if(!name || !net) return alert('Preencha Nome e Rede');
    await addDoc(getColl('stores'), {name, network:net, state:uf, city});
    await loadStruct(); router('config-struct');
};

window.addHoliday = async () => {
    const d = document.getElementById('hol-date').value;
    const n = document.getElementById('hol-name').value;
    const t = document.getElementById('hol-type').value;
    const s = document.getElementById('hol-scope').value;
    if(!d || !n) return alert('Preencha Data e Nome');
    await addDoc(getColl('holidays'), {date:d, name:n, type:t, scope:s});
    await loadStruct(); router('config-struct');
};

window.delStruct = async (c, id) => { 
    if(confirm('Tem certeza que deseja apagar?')) { 
        await deleteDoc(doc(db,'artifacts',appId,'public','data',c,id)); 
        await loadStruct(); 
        router('config-struct'); 
    }
};

// 4. RH (COLABORADORES)
async function renderRH(el) {
    const snap = await getDocs(getColl('employees'));
    employees = snap.docs.map(d => ({id:d.id, ...d.data()}));
    
    el.innerHTML = `
        <div class="bg-white rounded shadow p-6">
            <div class="flex justify-between items-center mb-6 flex-wrap gap-4">
                <h2 class="text-2xl font-bold"><i class="fa-solid fa-users text-blue-600"></i> Colaboradores</h2>
                <button onclick="openEmpModal()" class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition flex gap-2 items-center">
                    <i class="fa-solid fa-plus"></i> Novo Cadastro
                </button>
            </div>

            <div class="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-bold mb-1">Filtrar por Estado</label>
                    <select id="filter-state" onchange="filterEmployees()" class="w-full border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                        <option value="">Todos os Estados</option>
                        ${struct.states.map(s => `<option>${s.name}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-bold mb-1">Filtrar por Cargo</label>
                    <select id="filter-role" onchange="filterEmployees()" class="w-full border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                        <option value="">Todos os Cargos</option>
                        ${struct.roles.map(r => `<option>${r.name}</option>`).join('')}
                    </select>
                </div>
            </div>

            <div class="overflow-x-auto">
                <table class="w-full text-sm text-left" id="employees-table">
                    <thead class="bg-gray-100 uppercase border-b">
                        <tr>
                            <th class="p-3">Nome/CPF</th>
                            <th class="p-3">Cargo</th>
                            <th class="p-3">Local</th>
                            <th class="p-3">Admissão</th>
                            <th class="p-3">Ação</th>
                        </tr>
                    </thead>
                    <tbody id="employees-tbody">
                        ${renderEmployeesTable(employees)}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderEmployeesTable(emps) {
    if(emps.length === 0) return '<tr><td colspan="5" class="p-4 text-center text-gray-500">Nenhum colaborador encontrado</td></tr>';
    
    return emps.sort((a,b) => a.nomeCompleto.localeCompare(b.nomeCompleto)).map(e => `
        <tr class="border-b hover:bg-gray-50 transition">
            <td class="p-3">
                <div class="font-bold">${e.nomeCompleto}</div>
                <div class="text-xs text-gray-500">${e.cpf || 'N/A'}</div>
            </td>
            <td class="p-3">${e.cargo || 'N/A'}</td>
            <td class="p-3">${e.municipio || 'N/A'}/${e.estado || 'N/A'}</td>
            <td class="p-3 text-xs">${e.dataAdmissao ? new Date(e.dataAdmissao).toLocaleDateString('pt-BR') : 'N/A'}</td>
            <td class="p-3 flex gap-2">
                <button onclick="openEmpModal('${e.id}')" class="text-blue-600 hover:text-blue-800 transition" title="Editar"><i class="fa-solid fa-pen"></i></button>
                <button onclick="delEmp('${e.id}')" class="text-red-600 hover:text-red-800 transition" title="Deletar"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

window.filterEmployees = () => {
    const state = document.getElementById('filter-state').value;
    const role = document.getElementById('filter-role').value;
    
    const filtered = employees.filter(e => {
        const matchState = !state || e.estado === state;
        const matchRole = !role || e.cargo === role;
        return matchState && matchRole;
    });
    
    document.getElementById('employees-tbody').innerHTML = renderEmployeesTable(filtered);
};

window.openEmpModal = (id) => {
    const emp = id ? employees.find(e => e.id===id) : {};
    const isEdit = !!id;
    
    const genUser = emp.loginUser || `user${Math.floor(Math.random()*9000)+1000}`;
    const genPass = emp.loginPass || Math.random().toString(36).slice(-6);

    document.getElementById('modal-content').innerHTML = `
        <div class="p-6 bg-white">
            <h2 class="text-xl font-bold mb-4 border-b pb-2 flex items-center gap-2">
                <i class="fa-solid fa-${isEdit ? 'pen' : 'plus'} text-blue-600"></i> ${isEdit ? 'Editar' : 'Novo'} Colaborador
            </h2>
            <form id="form-emp" class="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                <div class="md:col-span-3 font-bold text-blue-600 mt-2 flex items-center gap-2"><i class="fa-solid fa-user"></i> Dados Pessoais</div>
                <input id="e-nome" value="${emp.nomeCompleto||''}" class="border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="Nome Completo" required>
                <input id="e-nasc" value="${emp.dataNascimento||''}" type="date" class="border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                <input id="e-cpf" value="${emp.cpf||''}" class="border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="CPF">
                <input id="e-rg" value="${emp.rg||''}" class="border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="RG">
                <input id="e-pis" value="${emp.nisPIS||''}" class="border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="NIS/PIS">
                
                <div class="md:col-span-3 font-bold text-blue-600 mt-2 flex items-center gap-2"><i class="fa-solid fa-map-marker-alt"></i> Endereço</div>
                <input id="e-end" value="${emp.endereco||''}" class="border p-2 rounded md:col-span-2 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="Logradouro, Nº, Bairro">
                <select id="e-uf" class="border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                    <option value="">Estado</option>
                    ${struct.states.map(s => `<option ${s.name===emp.estado?'selected':''}>${s.name}</option>`).join('')}
                </select>
                <input id="e-mun" value="${emp.municipio||''}" class="border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="Município">

                <div class="md:col-span-3 font-bold text-blue-600 mt-2 flex items-center gap-2"><i class="fa-solid fa-briefcase"></i> Profissional & Acesso</div>
                <div>
                    <label class="text-xs font-bold">Cargo</label>
                    <select id="e-cargo" class="w-full border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" onchange="toggleStoreSelect()">
                        <option value="">Selecione...</option>
                        ${struct.roles.map(r => `<option ${r.name===emp.cargo?'selected':''}>${r.name}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="text-xs font-bold">Data Admissão</label>
                    <input type="date" id="e-adm" value="${emp.dataAdmissao||''}" class="w-full border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                </div>
                <div>
                    <label class="text-xs font-bold">Jornada (HH:mm)</label>
                    <input type="time" id="e-jornada" value="${emp.jornadaHHMM||'08:00'}" class="w-full border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                </div>

                <div class="md:col-span-3 bg-gray-100 p-3 rounded text-xs font-mono border">
                    <div class="font-bold text-gray-700 mb-2">Credenciais (Auto-geradas)</div>
                    <div>Usuário: <span id="view-user" class="font-bold">${genUser}</span></div>
                    <div>Senha: <span id="view-pass" class="font-bold">${genPass}</span></div>
                </div>

                <div class="md:col-span-3 bg-gray-50 p-4 rounded border">
                    <label class="font-bold text-sm block mb-2">Vínculo de Lojas/Redes</label>
                    <div id="store-selector" class="max-h-40 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        <p class="text-gray-500 italic">Selecione um cargo primeiro.</p>
                    </div>
                </div>

                <div class="md:col-span-3 flex justify-end gap-3 mt-4 border-t pt-4">
                    <button type="button" onclick="document.getElementById('modal-overlay').classList.add('hidden')" class="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400 transition">Cancelar</button>
                    <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 transition">Salvar</button>
                </div>
            </form>
        </div>
    `;
    document.getElementById('modal-overlay').classList.remove('hidden');
    
    window.toggleStoreSelect = () => {
        const cargo = document.getElementById('e-cargo').value.toLowerCase();
        const container = document.getElementById('store-selector');
        const savedStores = emp.storeIds || [];

        if(!cargo) { container.innerHTML = '<p class="text-gray-500 italic">Selecione um cargo primeiro.</p>'; return; }

        container.innerHTML = struct.stores.map(s => `
            <label class="flex items-center gap-2 p-2 hover:bg-white rounded transition">
                <input type="checkbox" name="sel_stores" value="${s.id}" ${savedStores.includes(s.id)?'checked':''}>
                <span><b>${s.name}</b> (${s.network})</span>
            </label>
        `).join('');
    };
    if(emp.cargo) toggleStoreSelect();

    document.getElementById('form-emp').onsubmit = async (e) => {
        e.preventDefault();
        const stores = Array.from(document.querySelectorAll('input[name="sel_stores"]:checked')).map(cb => cb.value);
        
        const data = {
            nomeCompleto: document.getElementById('e-nome').value,
            dataNascimento: document.getElementById('e-nasc').value,
            cpf: document.getElementById('e-cpf').value,
            rg: document.getElementById('e-rg').value,
            nisPIS: document.getElementById('e-pis').value,
            endereco: document.getElementById('e-end').value,
            estado: document.getElementById('e-uf').value,
            municipio: document.getElementById('e-mun').value,
            cargo: document.getElementById('e-cargo').value,
            dataAdmissao: document.getElementById('e-adm').value,
            jornadaHHMM: document.getElementById('e-jornada').value,
            loginUser: genUser,
            loginPass: genPass,
            storeIds: stores
        };

        if(isEdit) await updateDoc(doc(db,'artifacts',appId,'public','data','employees',id), data);
        else await addDoc(getColl('employees'), data);
        
        document.getElementById('modal-overlay').classList.add('hidden');
        router('rh');
    };
}

window.delEmp = async(id) => { 
    if(confirm('Tem certeza que deseja apagar este colaborador?')) { 
        await deleteDoc(doc(db,'artifacts',appId,'public','data','employees',id)); 
        router('rh'); 
    }
};

// 5. RELATÓRIOS (COM FERIADOS E OCORRÊNCIAS)
async function renderReports(el) {
    const snap = await getDocs(getColl('employees'));
    employees = snap.docs.map(d => ({id:d.id, ...d.data()}));
    
    el.innerHTML = `
        <div class="no-print bg-white p-6 rounded shadow mb-8">
            <h2 class="text-xl font-bold mb-6 flex items-center gap-2"><i class="fa-solid fa-file-contract text-blue-600"></i> Relatório de Ponto</h2>
            
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div>
                    <label class="block text-sm font-bold mb-1">Filtrar por Estado</label>
                    <select id="r-state" onchange="filterReportEmployees()" class="w-full border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                        <option value="">Todos os Estados</option>
                        ${struct.states.map(s => `<option>${s.name}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-bold mb-1">Filtrar por Cargo</label>
                    <select id="r-role" onchange="filterReportEmployees()" class="w-full border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                        <option value="">Todos os Cargos</option>
                        ${struct.roles.map(r => `<option>${r.name}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-bold mb-1">Colaborador</label>
                    <select id="r-emp" class="w-full border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                        <option value="">Selecione Colaborador...</option>
                        ${employees.map(e=>`<option value="${e.id}">${e.nomeCompleto}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-bold mb-1">Mês/Ano</label>
                    <input type="month" id="r-mes" value="${new Date().toISOString().slice(0,7)}" class="w-full border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                </div>
            </div>

            <div class="flex gap-2 flex-wrap">
                <button onclick="genReport()" class="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-700 transition flex items-center gap-2">
                    <i class="fa-solid fa-file-pdf"></i> Gerar Relatório
                </button>
                <button onclick="genReportBatch()" class="bg-green-600 text-white px-4 py-2 rounded font-bold hover:bg-green-700 transition flex items-center gap-2">
                    <i class="fa-solid fa-list-check"></i> Gerar em Lote
                </button>
            </div>
            <p class="text-xs text-gray-500 mt-2"><i class="fa-solid fa-info-circle"></i> Clique em um dia na tabela para adicionar ocorrência.</p>
        </div>
        <div id="report-paper" class="hidden bg-white shadow-xl mx-auto p-8 max-w-[210mm] min-h-[297mm]"></div>
    `;
}

window.filterReportEmployees = () => {
    const state = document.getElementById('r-state').value;
    const role = document.getElementById('r-role').value;
    
    const filtered = employees.filter(e => {
        const matchState = !state || e.estado === state;
        const matchRole = !role || e.cargo === role;
        return matchState && matchRole;
    });
    
    const select = document.getElementById('r-emp');
    const currentValue = select.value;
    select.innerHTML = '<option value="">Selecione Colaborador...</option>' + 
        filtered.map(e => `<option value="${e.id}" ${e.id === currentValue ? 'selected' : ''}>${e.nomeCompleto}</option>`).join('');
};

window.genReport = async () => {
    const eid = document.getElementById('r-emp').value;
    const mes = document.getElementById('r-mes').value;
    if(!eid) return alert('Selecione um colaborador');

    const emp = employees.find(e => e.id === eid);
    const [y, m] = mes.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    
    const q = query(getColl('registros_ponto'), where('userId','==',eid));
    const snap = await getDocs(q);
    const allPoints = snap.docs.map(d => ({...d.data(), d:d.data().timestamp.toDate()}));
    
    const monthPoints = allPoints.filter(p => p.d.getMonth() === m-1 && p.d.getFullYear() === y).sort((a,b)=>a.d-b.d);

    let rows = '';
    let totalMin = 0;
    let targetMin = 0;
    if(emp.jornadaHHMM) {
        const [h, min] = emp.jornadaHHMM.split(':').map(Number);
        targetMin = h * 60 + min;
    }

    for(let i=1; i<=daysInMonth; i++) {
        const date = new Date(y, m-1, i);
        const dayStr = date.toLocaleDateString('pt-BR');
        const isoDate = date.toISOString().split('T')[0];
        const wd = date.getDay();
        const isSunday = wd === 0;
        const dayOfWeek = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');

        const holiday = struct.holidays.find(h => {
            const hDate = h.date;
            if(hDate.slice(5) !== isoDate.slice(5)) return false;
            if(h.type === 'Nacional') return true;
            if(h.type === 'Estadual' && h.scope === emp.estado) return true;
            if(h.type === 'Municipal' && h.scope.toLowerCase() === emp.municipio.toLowerCase()) return true;
            return false;
        });

        const dayP = monthPoints.filter(p => p.d.getDate() === i);
        const getT = (type) => {
            const f = dayP.find(x => x.tipo.includes(type));
            return f ? f.d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
        };

        let workMin = 0;
        if(dayP.length > 1) {
            const start = dayP[0].d;
            const end = dayP[dayP.length-1].d;
            workMin = (end - start)/60000;
            const lOut = dayP.find(x=>x.tipo.includes('Saída Almoço'));
            const lIn = dayP.find(x=>x.tipo.includes('Volta Almoço'));
            if(lOut && lIn) workMin -= (lIn.d - lOut.d)/60000;
            workMin = Math.floor(workMin);
        }
        
        if(!isSunday && !holiday) totalMin += workMin;

        const obs = holiday ? `<span class="text-red-500 font-bold">${holiday.name}</span>` : (isSunday ? 'DSR' : '');

        rows += `
            <tr onclick="addEvent('${date.toISOString()}')" class="cursor-pointer hover:bg-yellow-50 ${holiday ? 'bg-red-50' : (isSunday ? 'bg-gray-100' : '')}">
                <td>${i}/${m} (${dayOfWeek})</td>
                <td>${getT('Entrada')}</td>
                <td>${getT('Saída Almoço')}</td>
                <td>${getT('Volta Almoço')}</td>
                <td>${getT('Saída')}</td>
                <td>${Math.floor(workMin/60)}:${(workMin%60).toString().padStart(2,'0')}</td>
                <td class="text-xs">${obs}</td>
            </tr>
        `;
    }

    const totalHours = Math.floor(totalMin/60);
    const totalMinutes = (totalMin%60).toString().padStart(2,'0');
    const targetHours = Math.floor(targetMin/60);
    const targetMinutes = (targetMin%60).toString().padStart(2,'0');
    const diffMin = totalMin - (targetMin * daysInMonth);
    const diffHours = Math.floor(Math.abs(diffMin)/60);
    const diffMinutes = (Math.abs(diffMin)%60).toString().padStart(2,'0');

    document.getElementById('report-paper').classList.remove('hidden');
    document.getElementById('report-paper').innerHTML = `
        <div class="report-header-print">
            <div class="text-center mb-2">
                <h1 class="font-bold text-lg">SISTEMA DE APURAÇÃO DE PONTOS</h1>
            </div>
            <div class="flex justify-between items-center pb-2 border-b">
                <div class="flex items-center gap-4">
                    ${company.logo ? `<img src="${company.logo}" class="h-12">` : ''}
                    <div><h1 class="text-lg font-bold uppercase">${company.nome}</h1><p class="text-xs">CNPJ: ${company.cnpj}</p></div>
                </div>
                <div class="text-right">
                    <h2 class="text-md font-bold">Período: 01/${m}/${y} a ${daysInMonth}/${m}/${y}</h2>
                </div>
            </div>
        </div>
        
        <div class="report-data-print grid grid-cols-2 gap-x-10 my-4 text-sm">
            <div><b>Nome:</b> ${emp.nomeCompleto}</div>
            <div><b>Jornada:</b> ${emp.jornadaHHMM || 'N/A'}</div>
            <div><b>Cargo:</b> ${emp.cargo || 'N/A'}</div>
            <div><b>Data de Admissão:</b> ${emp.dataAdmissao ? new Date(emp.dataAdmissao).toLocaleDateString('pt-BR') : 'N/A'}</div>
            <div><b>CPF:</b> ${emp.cpf || 'N/A'}</div>
            <div><b>PIS:</b> ${emp.nisPIS || 'N/A'}</div>
        </div>

        <table class="w-full text-center text-xs border-collapse">
            <thead class="bg-gray-200 border"><tr><th class="border p-1">Dia</th><th class="border p-1">Ent1</th><th class="border p-1">Sai1</th><th class="border p-1">Ent2</th><th class="border p-1">Sai2</th><th class="border p-1">Total</th><th class="border p-1">Obs/Just.</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>

        <div class="mt-4 pt-2 text-sm grid grid-cols-2 gap-4">
            <div><b>Total de Horas Trabalhadas:</b> ${totalHours}:${totalMinutes}</div>
            <div><b>Total de Horas Esperadas:</b> ${targetHours}:${targetMinutes}</div>
            <div><b>Diferença:</b> ${diffMin >= 0 ? '+' : '-'}${diffHours}:${diffMinutes}</div>
            <div><b>Status:</b> ${diffMin >= 0 ? '<span class="text-green-600 font-bold">Positivo</span>' : '<span class="text-red-600 font-bold">Negativo</span>'}</div>
        </div>
        
        <div class="mt-8 pt-8 border-t text-xs text-center">
            <p class="mb-6 text-gray-600">
                Como funcionário, reconheço como verdadeiras as informações contidas neste relatório. <br>
                Como empregador, reconheço como verdadeiras as informações contidas neste relatório.
            </p>
            <div class="flex justify-between gap-4">
                <div class="flex-1">
                    <div class="border-t border-black pt-2 min-h-16"></div>
                    <p class="text-xs font-bold mt-1">Assinatura Colaborador</p>
                </div>
                <div class="flex-1">
                    <div class="border-t border-black pt-2 min-h-16"></div>
                    <p class="text-xs font-bold mt-1">Assinatura Gestor</p>
                </div>
            </div>
        </div>
        <button onclick="window.print()" class="no-print fixed bottom-8 right-8 bg-blue-600 text-white p-4 rounded-full shadow-xl hover:bg-blue-700 transition"><i class="fa-solid fa-print"></i></button>
    `;
};

window.genReportBatch = async () => {
    const state = document.getElementById('r-state').value;
    const role = document.getElementById('r-role').value;
    const mes = document.getElementById('r-mes').value;
    
    const filtered = employees.filter(e => {
        const matchState = !state || e.estado === state;
        const matchRole = !role || e.cargo === role;
        return matchState && matchRole;
    });
    
    if(filtered.length === 0) return alert('Nenhum colaborador encontrado com os filtros selecionados');
    
    alert(`Será gerado relatório para ${filtered.length} colaborador(es). Cada um será aberto em uma nova aba.`);
    
    for(const emp of filtered) {
        document.getElementById('r-emp').value = emp.id;
        await genReport();
        // Pequeno delay para não sobrecarregar
        await new Promise(r => setTimeout(r, 500));
    }
};

window.addEvent = (dateIso) => {
    const note = prompt("Adicionar observação/justificativa para este dia:");
    if(note) alert("Observação registrada (Simulação: em produção salvaria no DB).");
};

// 6. LINKS & AUTO-CADASTRO
function renderLinks(el) {
    const base = window.location.href.split('?')[0].replace('index-manager.html', '');
    el.innerHTML = `
        <div class="bg-white p-6 rounded shadow max-w-2xl mx-auto">
            <h2 class="text-xl font-bold mb-6 flex items-center gap-2"><i class="fa-solid fa-link text-blue-600"></i> Links Públicos</h2>
            
            <div class="mb-6 p-4 bg-blue-50 rounded border border-blue-200">
                <h3 class="font-bold text-blue-700 mb-2 flex items-center gap-2"><i class="fa-solid fa-user-circle"></i> Acesso do Colaborador</h3>
                <p class="text-sm text-gray-600 mb-3">Link para colaboradores acessarem seu histórico de pontos e baterem ponto.</p>
                <div class="flex gap-2"><input readonly value="${base}index-employee.html" class="w-full bg-gray-100 p-2 text-sm border rounded font-mono"><button class="bg-blue-600 text-white px-3 rounded hover:bg-blue-700 transition" onclick="navigator.clipboard.writeText('${base}index-employee.html'); alert('Copiado!')"><i class="fa-solid fa-copy"></i></button></div>
            </div>

            <div class="mb-6 p-4 bg-green-50 rounded border border-green-200">
                <h3 class="font-bold text-green-700 mb-2 flex items-center gap-2"><i class="fa-solid fa-tablet-alt"></i> Quiosque de Ponto</h3>
                <p class="text-sm text-gray-600 mb-3">Para tablets ou computadores compartilhados.</p>
                <div class="flex gap-2"><input readonly value="${base}index-employee.html?mode=ponto" class="w-full bg-gray-100 p-2 text-sm border rounded font-mono"><button class="bg-green-600 text-white px-3 rounded hover:bg-green-700 transition" onclick="navigator.clipboard.writeText('${base}index-employee.html?mode=ponto'); alert('Copiado!')"><i class="fa-solid fa-copy"></i></button></div>
            </div>

            <div class="p-4 bg-orange-50 rounded border border-orange-200">
                <h3 class="font-bold text-orange-700 mb-2 flex items-center gap-2"><i class="fa-solid fa-file-signature"></i> Autocadastro</h3>
                <p class="text-sm text-gray-600 mb-3">Envie para novos candidatos preencherem os dados.</p>
                <div class="flex gap-2"><input readonly value="${base}index-employee.html?mode=autocadastro" class="w-full bg-gray-100 p-2 text-sm border rounded font-mono"><button class="bg-orange-600 text-white px-3 rounded hover:bg-orange-700 transition" onclick="navigator.clipboard.writeText('${base}index-employee.html?mode=autocadastro'); alert('Copiado!')"><i class="fa-solid fa-copy"></i></button></div>
            </div>
        </div>
    `;
}

init();

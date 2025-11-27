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
let employees = [], isKiosk = false, isAuto = false;

// INIT
async function init() {
    const params = new URLSearchParams(window.location.search);
    isKiosk = params.get('mode') === 'ponto';
    isAuto = params.get('mode') === 'autocadastro';

    if(typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token);
    else await signInAnonymously(auth);

    onAuthStateChanged(auth, async (u) => {
        if(u) {
            await Promise.all([loadCompany(), loadStruct()]);
            if(isKiosk) return renderKiosk(document.getElementById('app-content'));
            if(isAuto) return renderAutoCadastro(document.getElementById('app-content'));
            
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
    // Load structure collections
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
    const q = query(getColl('admins'), where('user','==',u), where('pass','==',p));
    const snap = await getDocs(q);
    if(!snap.empty) {
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
        case 'dashboard': renderDashboard(el); break;
        case 'rh': await renderRH(el); break;
        case 'relatorios': await renderReports(el); break;
        case 'config-company': renderConfigCompany(el); break;
        case 'config-struct': renderConfigStruct(el); break;
        case 'links': renderLinks(el); break;
    }
};

// --- MODULES ---

// 1. DASHBOARD
async function renderDashboard(el) {
    const snap = await getDocs(getColl('employees'));
    const total = snap.size;
    el.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="bg-white p-6 rounded shadow border-l-4 border-blue-500">
                <h3 class="text-gray-500 text-sm font-bold uppercase">Total Colaboradores</h3>
                <p class="text-3xl font-bold text-slate-800">${total}</p>
            </div>
            <div class="bg-white p-6 rounded shadow border-l-4 border-green-500">
                <h3 class="text-gray-500 text-sm font-bold uppercase">Lojas Cadastradas</h3>
                <p class="text-3xl font-bold text-slate-800">${struct.stores.length}</p>
            </div>
            <div class="bg-white p-6 rounded shadow border-l-4 border-purple-500">
                <h3 class="text-gray-500 text-sm font-bold uppercase">Redes</h3>
                <p class="text-3xl font-bold text-slate-800">${struct.networks.length}</p>
            </div>
        </div>
        <div class="mt-8 bg-white p-6 rounded shadow">
            <h3 class="font-bold mb-4">Acesso Rápido</h3>
            <div class="flex gap-4">
                <button onclick="router('rh')" class="bg-blue-100 text-blue-700 px-4 py-2 rounded hover:bg-blue-200">Gerenciar Equipe</button>
                <button onclick="router('config-struct')" class="bg-purple-100 text-purple-700 px-4 py-2 rounded hover:bg-purple-200">Cadastrar Lojas/Cargos</button>
            </div>
        </div>
    `;
}

// 2. CONFIG COMPANY (LOGO FILE)
function renderConfigCompany(el) {
    el.innerHTML = `
        <div class="bg-white p-6 rounded shadow max-w-2xl mx-auto">
            <h2 class="text-xl font-bold mb-4">Dados da Empresa</h2>
            <div class="space-y-4">
                <input id="c-nome" value="${company.nome||''}" class="w-full border p-2 rounded" placeholder="Razão Social">
                <input id="c-cnpj" value="${company.cnpj||''}" class="w-full border p-2 rounded" placeholder="CNPJ">
                
                <div>
                    <label class="block text-sm font-bold mb-1">Logomarca</label>
                    <input type="file" id="c-logo-file" accept="image/*" class="w-full border p-1 rounded bg-gray-50 text-sm">
                    <p class="text-xs text-gray-500 mt-1">Recomendado: PNG/JPG até 100KB.</p>
                    ${company.logo ? `<img src="${company.logo}" class="h-16 mt-2 border p-1 rounded">` : ''}
                </div>

                <button onclick="saveCompany()" class="bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700 w-full">Salvar</button>
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
    alert('Salvo!');
    router('config-company');
};

// 3. CONFIG STRUCTURE (TABS)
function renderConfigStruct(el) {
    el.innerHTML = `
        <div class="bg-white p-6 rounded shadow h-full flex flex-col">
            <h2 class="text-xl font-bold mb-6">Estrutura Operacional</h2>
            <div class="flex border-b mb-4 text-sm">
                <button onclick="openTab('tab-est')" class="px-4 py-2 border-b-2 border-blue-500 font-bold tab-btn">Estados</button>
                <button onclick="openTab('tab-carg')" class="px-4 py-2 border-b-2 border-transparent hover:border-gray-300 tab-btn">Cargos</button>
                <button onclick="openTab('tab-rede')" class="px-4 py-2 border-b-2 border-transparent hover:border-gray-300 tab-btn">Redes & Lojas</button>
                <button onclick="openTab('tab-fer')" class="px-4 py-2 border-b-2 border-transparent hover:border-gray-300 tab-btn">Feriados</button>
            </div>

            <div id="tab-est" class="tab-content">${renderSimpleCRUD('states', 'Estado (UF)', 'UF ex: SP, RJ')}</div>
            <div id="tab-carg" class="tab-content hidden">${renderSimpleCRUD('roles', 'Cargo', 'Nome do Cargo')}</div>
            <div id="tab-rede" class="tab-content hidden">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div><h4 class="font-bold text-sm mb-2 text-purple-600">Redes</h4>${renderSimpleCRUD('networks', 'Rede', 'Nome da Rede')}</div>
                    <div><h4 class="font-bold text-sm mb-2 text-green-600">Lojas</h4>${renderStoreCRUD()}</div>
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
        <li class="flex justify-between bg-gray-50 p-2 rounded mb-1 text-sm">
            ${i.name} <button onclick="delStruct('${coll}','${i.id}')" class="text-red-500"><i class="fa-solid fa-times"></i></button>
        </li>`).join('');
    return `
        <div class="flex gap-2 mb-2">
            <input id="new-${coll}" class="border p-2 rounded w-full text-sm" placeholder="${ph}">
            <button onclick="addStruct('${coll}')" class="bg-blue-600 text-white px-3 rounded"><i class="fa-solid fa-plus"></i></button>
        </div>
        <ul class="max-h-60 overflow-y-auto">${list}</ul>
    `;
}

function renderStoreCRUD() {
    const list = struct.stores.map(s => `
        <li class="flex justify-between bg-gray-50 p-2 rounded mb-1 text-sm">
            <div><b>${s.name}</b> <span class="text-xs text-gray-500">(${s.network}) - ${s.city}/${s.state}</span></div>
            <button onclick="delStruct('stores','${s.id}')" class="text-red-500"><i class="fa-solid fa-times"></i></button>
        </li>`).join('');
    return `
        <div class="space-y-2 mb-2 bg-gray-50 p-3 rounded">
            <input id="store-name" class="border p-1 w-full text-sm" placeholder="Nome Loja">
            <select id="store-net" class="border p-1 w-full text-sm"><option value="">Rede...</option>${struct.networks.map(n=>`<option>${n.name}</option>`).join('')}</select>
            <div class="flex gap-1">
                <select id="store-uf" class="border p-1 w-1/3 text-sm"><option value="">UF</option>${struct.states.map(s=>`<option>${s.name}</option>`).join('')}</select>
                <input id="store-city" class="border p-1 w-2/3 text-sm" placeholder="Município">
            </div>
            <button onclick="addStore()" class="bg-green-600 text-white w-full py-1 rounded text-sm">Adicionar Loja</button>
        </div>
        <ul class="max-h-60 overflow-y-auto">${list}</ul>
    `;
}

function renderHolidayCRUD() {
    const list = struct.holidays.map(h => `
        <li class="flex justify-between bg-gray-50 p-2 rounded mb-1 text-sm border-l-4 ${h.type==='Nacional'?'border-red-500':'border-orange-400'}">
            <div><b>${h.date}</b> - ${h.name} <span class="text-xs">(${h.type} ${h.scope||''})</span></div>
            <button onclick="delStruct('holidays','${h.id}')" class="text-red-500"><i class="fa-solid fa-times"></i></button>
        </li>`).join('');
    return `
        <div class="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4 bg-gray-50 p-3 rounded items-end">
            <div><label class="text-xs">Data</label><input type="date" id="hol-date" class="border p-1 w-full text-sm"></div>
            <div><label class="text-xs">Nome</label><input id="hol-name" class="border p-1 w-full text-sm"></div>
            <div><label class="text-xs">Tipo</label><select id="hol-type" class="border p-1 w-full text-sm"><option>Nacional</option><option>Estadual</option><option>Municipal</option></select></div>
            <div><label class="text-xs">Escopo (UF/Mun)</label><input id="hol-scope" class="border p-1 w-full text-sm" placeholder="Ex: SP ou Campinas"></div>
        </div>
        <button onclick="addHoliday()" class="bg-blue-600 text-white px-4 py-2 rounded text-sm w-full mb-2">Salvar Feriado</button>
        <ul class="max-h-60 overflow-y-auto">${list}</ul>
    `;
}

window.addStruct = async (coll) => {
    const val = document.getElementById('new-'+coll).value;
    if(!val) return;
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
    if(!d || !n) return;
    // Store date as MD (MM-DD) for recurrence or YYYY-MM-DD for specific? 
    // Simplified: Store YYYY-MM-DD for now.
    await addDoc(getColl('holidays'), {date:d, name:n, type:t, scope:s});
    await loadStruct(); router('config-struct');
};
window.delStruct = async (c, id) => { if(confirm('Apagar?')) { await deleteDoc(doc(db,'artifacts',appId,'public','data',c,id)); await loadStruct(); router('config-struct'); }};

// 4. RH (COLABORADORES)
async function renderRH(el) {
    const snap = await getDocs(getColl('employees'));
    employees = snap.docs.map(d => ({id:d.id, ...d.data()}));
    
    el.innerHTML = `
        <div class="bg-white rounded shadow p-6">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold">Colaboradores</h2>
                <button onclick="openEmpModal()" class="bg-green-600 text-white px-4 py-2 rounded flex gap-2 items-center"><i class="fa-solid fa-plus"></i> Novo Cadastro</button>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm text-left">
                    <thead class="bg-gray-100 uppercase">
                        <tr><th class="p-3">Nome/CPF</th><th class="p-3">Cargo</th><th class="p-3">Local</th><th class="p-3">Acesso</th><th class="p-3">Ação</th></tr>
                    </thead>
                    <tbody>
                        ${employees.map(e => `
                        <tr class="border-b hover:bg-gray-50">
                            <td class="p-3">
                                <div class="font-bold">${e.nomeCompleto}</div>
                                <div class="text-xs text-gray-500">${e.cpf}</div>
                            </td>
                            <td class="p-3">${e.cargo}</td>
                            <td class="p-3">${e.municipio}/${e.estado}</td>
                            <td class="p-3 font-mono text-xs">U: ${e.loginUser}<br>S: ${e.loginPass}</td>
                            <td class="p-3">
                                <button onclick="openEmpModal('${e.id}')" class="text-blue-600 mr-2"><i class="fa-solid fa-pen"></i></button>
                                <button onclick="delEmp('${e.id}')" class="text-red-600"><i class="fa-solid fa-trash"></i></button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

window.openEmpModal = (id) => {
    const emp = id ? employees.find(e => e.id===id) : {};
    const isEdit = !!id;
    
    // Random Creds Gen
    const genUser = emp.loginUser || `user${Math.floor(Math.random()*9000)+1000}`;
    const genPass = emp.loginPass || Math.random().toString(36).slice(-6);

    document.getElementById('modal-content').innerHTML = `
        <div class="p-6 bg-white">
            <h2 class="text-xl font-bold mb-4 border-b pb-2">${isEdit ? 'Editar' : 'Novo'} Colaborador</h2>
            <form id="form-emp" class="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                <div class="md:col-span-3 font-bold text-blue-600 mt-2">Dados Pessoais</div>
                <input id="e-nome" value="${emp.nomeCompleto||''}" class="border p-2 rounded" placeholder="Nome Completo" required>
                <input id="e-nasc" value="${emp.dataNascimento||''}" type="date" class="border p-2 rounded">
                <input id="e-cpf" value="${emp.cpf||''}" class="border p-2 rounded" placeholder="CPF">
                <input id="e-rg" value="${emp.rg||''}" class="border p-2 rounded" placeholder="RG">
                <input id="e-pis" value="${emp.nisPIS||''}" class="border p-2 rounded" placeholder="NIS/PIS">
                
                <div class="md:col-span-3 font-bold text-blue-600 mt-2">Endereço</div>
                <input id="e-end" value="${emp.endereco||''}" class="border p-2 rounded md:col-span-2" placeholder="Logradouro, Nº, Bairro">
                <select id="e-uf" class="border p-2 rounded" onchange="renderHolidayMsg()">
                    <option value="">Estado</option>
                    ${struct.states.map(s => `<option ${s.name===emp.estado?'selected':''}>${s.name}</option>`).join('')}
                </select>
                <input id="e-mun" value="${emp.municipio||''}" class="border p-2 rounded" placeholder="Município">

                <div class="md:col-span-3 font-bold text-blue-600 mt-2">Profissional & Acesso</div>
                <div>
                    <label class="text-xs">Cargo</label>
                    <select id="e-cargo" class="w-full border p-2 rounded" onchange="toggleStoreSelect()">
                        <option value="">Selecione...</option>
                        ${struct.roles.map(r => `<option ${r.name===emp.cargo?'selected':''}>${r.name}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="text-xs">Jornada (HH:mm)</label>
                    <input type="time" id="e-jornada" value="${emp.jornadaHHMM||'08:00'}" class="w-full border p-2 rounded">
                </div>
                <div class="bg-gray-100 p-2 rounded text-xs font-mono">
                    <div class="font-bold text-gray-500">Credenciais (Auto)</div>
                    <div>User: <span id="view-user">${genUser}</span></div>
                    <div>Pass: <span id="view-pass">${genPass}</span></div>
                </div>

                <div class="md:col-span-3 bg-gray-50 p-4 rounded border">
                    <label class="font-bold text-sm block mb-2">Vínculo de Lojas/Redes</label>
                    <div id="store-selector" class="max-h-40 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        <p class="text-gray-500 italic">Selecione um cargo primeiro.</p>
                    </div>
                </div>

                <div class="md:col-span-3 flex justify-end gap-3 mt-4 border-t pt-4">
                    <button type="button" onclick="document.getElementById('modal-overlay').classList.add('hidden')" class="px-4 py-2 bg-gray-300 rounded">Cancelar</button>
                    <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded font-bold">Salvar</button>
                </div>
            </form>
        </div>
    `;
    document.getElementById('modal-overlay').classList.remove('hidden');
    
    // Populate Store logic
    window.toggleStoreSelect = () => {
        const cargo = document.getElementById('e-cargo').value.toLowerCase();
        const container = document.getElementById('store-selector');
        const isRoteirista = cargo.includes('roteirista');
        const savedStores = emp.storeIds || [];

        if(!cargo) { container.innerHTML = ''; return; }

        container.innerHTML = struct.stores.map(s => `
            <label class="flex items-center gap-2 p-1 hover:bg-white rounded">
                <input type="${isRoteirista ? 'checkbox' : 'radio'}" name="sel_stores" value="${s.id}" ${savedStores.includes(s.id)?'checked':''}>
                <span><b>${s.name}</b> (${s.network})</span>
            </label>
        `).join('');
    };
    // Init store selector
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

window.delEmp = async(id) => { if(confirm('Apagar?')) { await deleteDoc(doc(db,'artifacts',appId,'public','data','employees',id)); router('rh'); }};


// 5. RELATÓRIOS (COM FERIADOS E OCORRÊNCIAS)
async function renderReports(el) {
    const snap = await getDocs(getColl('employees'));
    employees = snap.docs.map(d => ({id:d.id, ...d.data()}));
    
    el.innerHTML = `
        <div class="no-print bg-white p-6 rounded shadow max-w-4xl mx-auto mb-8">
            <h2 class="text-xl font-bold mb-4">Relatório de Ponto</h2>
            <div class="flex gap-4">
                <select id="r-emp" class="border p-2 rounded w-full"><option value="">Selecione Colaborador...</option>${employees.map(e=>`<option value="${e.id}">${e.nomeCompleto}</option>`).join('')}</select>
                <input type="month" id="r-mes" value="${new Date().toISOString().slice(0,7)}" class="border p-2 rounded">
                <button onclick="genReport()" class="bg-blue-600 text-white px-4 rounded font-bold">Gerar</button>
            </div>
            <p class="text-xs text-gray-500 mt-2">Clique em um dia na tabela para adicionar ocorrência.</p>
        </div>
        <div id="report-paper" class="hidden bg-white shadow-xl mx-auto p-8 max-w-[210mm] min-h-[297mm]"></div>
    `;
}

window.genReport = async () => {
    const eid = document.getElementById('r-emp').value;
    const mes = document.getElementById('r-mes').value;
    if(!eid) return;

    const emp = employees.find(e => e.id === eid);
    const [y, m] = mes.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    
    // Get Points
    const q = query(getColl('registros_ponto'), where('userId','==',eid));
    const snap = await getDocs(q);
    const allPoints = snap.docs.map(d => ({...d.data(), d:d.data().timestamp.toDate()}));
    
    // Filter month
    const monthPoints = allPoints.filter(p => p.d.getMonth() === m-1 && p.d.getFullYear() === y).sort((a,b)=>a.d-b.d);

    let rows = '';
    let totalMin = 0;
    const targetMin = (parseInt(emp.jornadaHHMM.split(':')[0])*60) + parseInt(emp.jornadaHHMM.split(':')[1]);

    for(let i=1; i<=daysInMonth; i++) {
        const date = new Date(y, m-1, i);
        const dayStr = date.toLocaleDateString('pt-BR'); // DD/MM/YYYY
        const isoDate = date.toISOString().split('T')[0]; // YYYY-MM-DD
        const wd = date.getDay();
        const isSunday = wd === 0; // Sábado agora é dia útil
        const dayOfWeek = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');

        // Check Holiday (Local + National)
        const holiday = struct.holidays.find(h => {
            const hDate = h.date; // YYYY-MM-DD
            // Lógica de feriado só funciona para o ano atual com essa implementação simplificada
            if(hDate.slice(5) !== isoDate.slice(5)) return false; 
            if(h.type === 'Nacional') return true;
            if(h.type === 'Estadual' && h.scope === emp.estado) return true;
            if(h.type === 'Municipal' && h.scope.toLowerCase() === emp.municipio.toLowerCase()) return true;
            return false;
        });

        // Points for day
        const dayP = monthPoints.filter(p => p.d.getDate() === i);
        const getT = (type) => {
            const f = dayP.find(x => x.tipo.includes(type));
            return f ? f.d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
        };

        // Calc Logic (Simplified)
        let workMin = 0;
        if(dayP.length > 1) {
            const start = dayP[0].d;
            const end = dayP[dayP.length-1].d;
            workMin = (end - start)/60000;
            // Deduct lunch if exists
            const lOut = dayP.find(x=>x.tipo.includes('Saída Almoço'));
            const lIn = dayP.find(x=>x.tipo.includes('Volta Almoço'));
            if(lOut && lIn) workMin -= (lIn.d - lOut.d)/60000;
            workMin = Math.floor(workMin);
        }
        
        if(!isSunday && !holiday) totalMin += workMin; // Considera Sábado como dia normal

        // Justification (stored in local var for now, in real app needs DB)
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

    document.getElementById('report-paper').classList.remove('hidden');
    document.getElementById('report-paper').innerHTML = `
        <div class="report-header-print">
            <div class="text-center mb-2">
                <h1>SISTEMA DE APURAÇÃO DE PONTOS</h1>
            </div>
            <div class="flex justify-between items-center pb-2">
                <div class="flex items-center gap-4">
                    ${company.logo ? `<img src="${company.logo}" class="h-10">` : ''}
                    <div><h1 class="text-lg font-bold uppercase">${company.nome}</h1><p class="text-xs">CNPJ: ${company.cnpj}</p></div>
                </div>
                <div class="text-right">
                    <h2 class="text-md font-bold">Período: 01/${m}/${y} a ${daysInMonth}/${m}/${y}</h2>
                </div>
            </div>
        </div>
        
        <div class="report-data-print grid grid-cols-2 gap-x-10">
            <div><b>Nome:</b> ${emp.nomeCompleto}</div>
            <div><b>Seg - Ter - Qua - Qui - Sex - Sáb:</b> ${emp.jornadaHHMM} - ${emp.jornadaHHMM}</div>
            <div><b>Cargo:</b> ${emp.cargo}</div>
            <div><b>Data de Admissão:</b> ${emp.dataAdmissao || 'N/A'}</div>
            <div><b>Matrícula:</b> ${emp.matricula || 'N/A'}</div>
            <div><b>PIS:</b> ${emp.nisPIS || 'N/A'}</div>
            <div><b>CPF:</b> ${emp.cpf || 'N/A'}</div>
        </div>

        <table class="w-full text-center text-xs">
            <thead class="bg-gray-200"><tr><th>Dia</th><th>Ent1</th><th>Sai1</th><th>Ent2</th><th>Sai2</th><th>Total</th><th>Obs/Just.</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>

        <div class="mt-4 pt-2 text-sm">
            <b>TOTAIS:</b> Total de Horas Trabalhadas: ${totalHours}:${totalMinutes}
        </div>
        
        <div class="mt-8 pt-8 border-t text-xs text-center">
            <p class="mb-4 text-gray-600">
                Como funcionário, reconheço como verdadeiras as informações contidas neste relatório. <br>
                Como empregador, reconheço como verdadeiras as informações contidas neste relatório.
            </p>
            <div class="flex justify-between">
                <div class="w-1/3 border-t border-black pt-2">Assinatura Colaborador</div>
                <div class="w-1/3 border-t border-black pt-2">Assinatura Gestor</div>
            </div>
        </div>
        <button onclick="window.print()" class="no-print fixed bottom-8 right-8 bg-blue-600 text-white p-4 rounded-full shadow-xl"><i class="fa-solid fa-print"></i></button>
    `;
};

window.addEvent = (dateIso) => {
    const note = prompt("Adicionar observação/justificativa para este dia:");
    if(note) alert("Observação registrada (Simulação: em produção salvaria no DB).");
};

// 6. LINKS & AUTO-CADASTRO
function renderLinks(el) {
    const base = window.location.href.split('?')[0];
    el.innerHTML = `
        <div class="bg-white p-6 rounded shadow max-w-2xl mx-auto">
            <h2 class="text-xl font-bold mb-6">Links Públicos</h2>
            
            <div class="mb-6">
                <h3 class="font-bold text-blue-600">📍 Quiosque de Ponto</h3>
                <p class="text-sm text-gray-500 mb-2">Para tablets ou computadores compartilhados.</p>
                <div class="flex gap-2"><input readonly value="${base}?mode=ponto" class="w-full bg-gray-100 p-2 text-sm border rounded"><button class="bg-blue-100 p-2 rounded" onclick="navigator.clipboard.writeText('${base}?mode=ponto')">Copiar</button></div>
            </div>

            <div>
                <h3 class="font-bold text-green-600">📝 Autocadastro</h3>
                <p class="text-sm text-gray-500 mb-2">Envie para novos candidatos preencherem os dados.</p>
                <div class="flex gap-2"><input readonly value="${base}?mode=autocadastro" class="w-full bg-gray-100 p-2 text-sm border rounded"><button class="bg-green-100 p-2 rounded" onclick="navigator.clipboard.writeText('${base}?mode=autocadastro')">Copiar</button></div>
            </div>
        </div>
    `;
}

// --- MODO PONTO (LOGIN REAL) ---
async function renderKiosk(el) {
    document.getElementById('main-container').className = "w-full h-full bg-slate-900 flex items-center justify-center p-4";
    
    // Check persistence
    const savedAuth = JSON.parse(localStorage.getItem('ponto_auth'));
    if(savedAuth) {
        return renderPointClock(el, savedAuth);
    }

    el.innerHTML = `
        <div class="bg-white p-8 rounded-lg shadow-2xl w-full max-w-sm text-center">
            ${company.logo ? `<img src="${company.logo}" class="h-16 mx-auto mb-4">` : ''}
            <h2 class="text-2xl font-bold mb-2 text-slate-800">Ponto Eletrônico</h2>
            <p class="text-gray-500 text-sm mb-6">Faça login para registrar</p>
            
            <form id="ponto-login" class="space-y-4">
                <input id="k-user" class="w-full border p-3 rounded bg-gray-50" placeholder="Usuário">
                <input id="k-pass" type="password" class="w-full border p-3 rounded bg-gray-50" placeholder="Senha">
                <label class="flex items-center gap-2 text-sm text-gray-600 justify-center">
                    <input type="checkbox" id="k-keep"> Manter conectado
                </label>
                <button type="submit" class="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700 shadow-lg">ENTRAR</button>
            </form>
        </div>
    `;

    document.getElementById('ponto-login').onsubmit = async (e) => {
        e.preventDefault();
        const u = document.getElementById('k-user').value;
        const p = document.getElementById('k-pass').value;
        
        const q = query(getColl('employees'), where('loginUser','==',u), where('loginPass','==',p));
        const snap = await getDocs(q);
        
        if(snap.empty) return alert('Dados incorretos');
        
        const emp = {id:snap.docs[0].id, ...snap.docs[0].data()};
        if(document.getElementById('k-keep').checked) {
            localStorage.setItem('ponto_auth', JSON.stringify(emp));
        }
        renderPointClock(el, emp);
    }
}

function renderPointClock(el, emp) {
    el.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div class="bg-blue-600 p-6 text-white text-center">
                <h2 class="text-2xl font-bold">Olá, ${emp.nomeCompleto.split(' ')[0]}</h2>
                <p class="opacity-80 text-sm">${emp.cargo}</p>
            </div>
            <div class="p-8 text-center">
                <div id="clock" class="text-5xl font-mono font-bold text-slate-700 mb-2">--:--</div>
                <div id="date" class="text-gray-400 font-bold uppercase text-xs mb-8">--</div>
                
                <div id="last-reg" class="bg-gray-100 p-2 rounded text-sm mb-6">Último: <span id="last-st">...</span></div>

                <button id="btn-hit" class="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-xl font-bold text-xl transition transform active:scale-95">
                    REGISTRAR PONTO
                </button>
                
                <button onclick="logoutPonto()" class="mt-6 text-gray-400 text-sm hover:text-red-500 underline">Sair / Trocar Conta</button>
            </div>
        </div>
    `;

    setInterval(() => {
        const d = new Date();
        if(document.getElementById('clock')) {
            document.getElementById('clock').innerText = d.toLocaleTimeString('pt-BR');
            document.getElementById('date').innerText = d.toLocaleDateString('pt-BR',{weekday:'long', day:'numeric', month:'long'});
        }
    }, 1000);

    // Fetch last
    (async () => {
        const q = query(getColl('registros_ponto')); // simplified fetch
        const snap = await getDocs(q);
        const today = new Date().toISOString().split('T')[0];
        const recs = snap.docs.map(d=>d.data()).filter(r => r.userId === emp.id && r.timestamp.toDate().toISOString().startsWith(today)).sort((a,b)=>a.timestamp-b.timestamp);
        const last = recs.length ? recs[recs.length-1].tipo : 'Nenhum';
        document.getElementById('last-st').innerText = last;
        
        const btn = document.getElementById('btn-hit');
        let next = 'Entrada';
        if(last === 'Entrada') next = 'Saída Almoço';
        else if(last === 'Saída Almoço') next = 'Volta Almoço';
        else if(last === 'Volta Almoço') next = 'Saída';
        
        btn.innerText = `REGISTRAR ${next.toUpperCase()}`;
        btn.onclick = async () => {
            btn.disabled = true;
            await addDoc(getColl('registros_ponto'), { userId: emp.id, tipo: next, timestamp: serverTimestamp() });
            alert('Registrado!');
            renderPointClock(el, emp); // refresh
        }
    })();
}

window.logoutPonto = () => {
    localStorage.removeItem('ponto_auth');
    renderKiosk(document.getElementById('app-content'));
}

// --- MODO AUTO CADASTRO ---
function renderAutoCadastro(el) {
    document.getElementById('main-container').className = "w-full h-full bg-gray-100 overflow-y-auto p-4";
    el.innerHTML = `
        <div class="max-w-2xl mx-auto bg-white p-8 rounded shadow-xl my-10">
            <h2 class="text-2xl font-bold mb-4 text-center">Ficha de Admissão Digital</h2>
            <p class="text-gray-500 text-sm text-center mb-8">Preencha seus dados corretamente. Sua senha de acesso será gerada automaticamente.</p>
            
            <form id="form-auto" class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input id="a-nome" class="border p-2 rounded" placeholder="Nome Completo" required>
                    <input id="a-cpf" class="border p-2 rounded" placeholder="CPF" required>
                    <input id="a-rg" class="border p-2 rounded" placeholder="RG" required>
                    <input id="a-nasc" type="date" class="border p-2 rounded" required>
                    <input id="a-pis" class="border p-2 rounded" placeholder="PIS/NIS">
                    <input id="a-end" class="border p-2 rounded md:col-span-2" placeholder="Endereço Completo">
                    
                    <select id="a-uf" class="border p-2 rounded" required>
                        <option value="">Selecione seu Estado</option>
                        ${struct.states.map(s => `<option>${s.name}</option>`).join('')}
                    </select>
                    <input id="a-mun" class="border p-2 rounded" placeholder="Município" required>
                </div>
                <button type="submit" class="w-full bg-green-600 text-white py-3 rounded font-bold hover:bg-green-700">ENVIAR CADASTRO</button>
            </form>
        </div>
    `;

    document.getElementById('form-auto').onsubmit = async (e) => {
        e.preventDefault();
        const genUser = document.getElementById('a-nome').value.split(' ')[0].toLowerCase() + Math.floor(Math.random()*100);
        const genPass = Math.random().toString(36).slice(-6);
        
        const data = {
            nomeCompleto: document.getElementById('a-nome').value,
            cpf: document.getElementById('a-cpf').value,
            rg: document.getElementById('a-rg').value,
            dataNascimento: document.getElementById('a-nasc').value,
            nisPIS: document.getElementById('a-pis').value,
            endereco: document.getElementById('a-end').value,
            estado: document.getElementById('a-uf').value,
            municipio: document.getElementById('a-mun').value,
            loginUser: genUser,
            loginPass: genPass,
            cargo: 'Novo (Aguardando)', // Default
            jornadaHHMM: '08:00'
        };
        
        await addDoc(getColl('employees'), data);
        el.innerHTML = `
            <div class="max-w-md mx-auto bg-white p-8 rounded shadow text-center mt-20">
                <i class="fa-solid fa-check-circle text-5xl text-green-500 mb-4"></i>
                <h2 class="text-2xl font-bold">Cadastro Realizado!</h2>
                <p class="text-gray-600 mt-2">Anote suas credenciais provisórias:</p>
                <div class="bg-gray-100 p-4 rounded mt-4 font-mono text-lg border border-dashed border-gray-400">
                    <p>Usuário: <b>${genUser}</b></p>
                    <p>Senha: <b>${genPass}</b></p>
                </div>
                <p class="text-xs text-gray-400 mt-4">Informe ao seu gestor para liberação.</p>
            </div>
        `;
    }
}

init();

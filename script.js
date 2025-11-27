import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, addDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ====================================================================
// CONFIGURAÇÃO DO FIREBASE
// ====================================================================
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
// Cria uma referência para coleções dentro da estrutura customizada (Firestore Data Hierarchy)
const getColl = (c) => collection(db, 'artifacts', appId, 'public', 'data', c);

// ====================================================================
// ESTADO E VARIÁVEIS GLOBAIS
// ====================================================================
let company = {}, struct = { roles:[], holidays:[], networks:[], stores:[], states:[] };
let employees = [], isKiosk = false, isAuto = false;
let currentKioskUser = null;

// ====================================================================
// UTILITY HELPERS
// ====================================================================

// Converte total de minutos para o formato HH:MM
const formatMinutesToHHMM = (totalMinutes) => {
    if (isNaN(totalMinutes) || totalMinutes === null) return '00:00';
    const sign = totalMinutes < 0 ? '-' : '';
    const absMinutes = Math.abs(totalMinutes);
    const h = Math.floor(absMinutes / 60);
    const m = absMinutes % 60;
    return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const showAlert = (message, type = 'info', duration = 3000) => {
    const alertBox = document.getElementById('global-alert');
    const alertMessage = document.getElementById('global-alert-message');
    
    if (alertBox && alertMessage) {
        alertMessage.textContent = message;
        alertBox.className = `fixed top-0 left-1/2 transform -translate-x-1/2 p-4 mt-2 rounded shadow-lg z-50 transition-opacity duration-300 ${type === 'success' ? 'bg-green-500 text-white' : type === 'error' ? 'bg-red-500 text-white' : type === 'warning' ? 'bg-yellow-500 text-white' : 'bg-blue-500 text-white'}`;
        alertBox.classList.remove('hidden', 'opacity-0');
        alertBox.classList.add('opacity-100');

        setTimeout(() => {
            alertBox.classList.remove('opacity-100');
            alertBox.classList.add('opacity-0');
            setTimeout(() => alertBox.classList.add('hidden'), 300);
        }, duration);
    } else {
        console.log(`ALERTA (${type}): ${message}`);
    }
}

// ====================================================================
// INICIALIZAÇÃO E CARREGAMENTO DE DADOS
// ====================================================================
async function init() {
    const params = new URLSearchParams(window.location.search);
    isKiosk = params.get('mode') === 'ponto';
    isAuto = params.get('mode') === 'autocadastro';

    // Autenticação anônima ou customizada (para poder acessar o Firestore)
    if(typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token);
    else await signInAnonymously(auth);

    onAuthStateChanged(auth, async (u) => {
        if(u) {
            // Carrega dados globais
            await Promise.all([loadCompany(), loadStruct()]);
            
            // Fluxo Quiosque (Ponto)
            if(isKiosk) return renderKiosk(document.getElementById('app-content'));
            
            // Fluxo Autocadastro
            if(isAuto) return renderAutoCadastro(document.getElementById('app-content'));
            
            // Fluxo Admin/Gestor
            const admins = await getDocs(getColl('admins'));
            if(admins.empty) await addDoc(getColl('admins'), {user:'admin', pass:'123456'}); // Cria admin inicial
            document.getElementById('login-screen').classList.remove('hidden');
            document.getElementById('login-screen').classList.add('flex');
        }
    });
}

// Carrega dados da Empresa (Logo, CNPJ, etc.)
async function loadCompany() {
    const snap = await getDocs(getColl('config'));
    company = snap.empty ? {nome:'Minha Empresa', logo:''} : {id:snap.docs[0].id, ...snap.docs[0].data()};
}
// Carrega dados estruturais (Cargos, Feriados, Lojas, etc.)
async function loadStruct() {
    const load = async (k) => {
        const s = await getDocs(getColl(k));
        struct[k] = s.docs.map(d=>({id:d.id, ...d.data()}));
    };
    await Promise.all(['roles','holidays','networks','stores','states'].map(load));
    // Ordena estados para selects
    struct.states.sort((a,b) => a.name.localeCompare(b.name));
}

// Inicia o processo de inicialização
document.addEventListener('DOMContentLoaded', init);


// ====================================================================
// AUTENTICAÇÃO DO GESTOR
// ====================================================================
document.getElementById('form-login').onsubmit = async (e) => {
    e.preventDefault();
    const u = document.getElementById('login-user').value;
    const p = document.getElementById('login-pass').value;
    
    document.getElementById('login-msg').innerText = "Verificando...";
    document.getElementById('login-msg').classList.remove('hidden');

    const q = query(getColl('admins'), where('user','==',u), where('pass','==',p));
    const snap = await getDocs(q);
    
    if(!snap.empty) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('sidebar').classList.remove('hidden');
        document.getElementById('sidebar').classList.add('flex');
        document.getElementById('login-msg').classList.add('hidden');
        router('dashboard');
    } else {
        document.getElementById('login-msg').innerText = "Credenciais inválidas";
    }
};

// ====================================================================
// ROTEAMENTO PRINCIPAL
// ====================================================================
window.router = async (view) => {
    const el = document.getElementById('app-content');
    el.innerHTML = '<div class="flex justify-center mt-20"><div class="loader"></div></div>';
    // Oculta sidebar em mobile após clique
    if(window.innerWidth < 768) document.getElementById('sidebar').classList.add('hidden');
    
    // Atualiza a navegação ativa
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('bg-slate-700'));
    document.querySelector(`.nav-item[onclick*="router('${view}')"]`)?.classList.add('bg-slate-700');

    switch(view) {
        case 'dashboard': renderDashboard(el); break;
        case 'rh': await renderRH(el); break;
        case 'relatorios': await renderReports(el); break;
        case 'config-company': renderConfigCompany(el); break;
        case 'config-struct': renderConfigStruct(el); break;
        case 'links': renderLinks(el); break;
        default: el.innerHTML = '<div class="text-center mt-20 text-gray-500">Página não encontrada.</div>';
    }
};

// ====================================================================
// MÓDULO 1: DASHBOARD
// ====================================================================
async function renderDashboard(el) {
    const snap = await getDocs(getColl('employees'));
    const allEmployees = snap.docs.map(d => ({id:d.id, ...d.data()}));
    const total = allEmployees.length;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentDay = now.getDate();

    // Filtra aniversariantes do mês (simplificado)
    const aniversariantes = allEmployees.filter(emp => {
        if (!emp.dataNascimento) return false;
        const nascParts = emp.dataNascimento.split('-'); // YYYY-MM-DD
        return new Date(nascParts[0], nascParts[1] - 1, nascParts[2]).getMonth() === currentMonth;
    }).sort((a, b) => {
        const dateA = new Date(a.dataNascimento).getDate();
        const dateB = new Date(b.dataNascimento).getDate();
        return dateA - dateB;
    });

    // STUB: Férias Próximas (Próximos 3 meses) - Assumindo campo 'proximaFerias'
    const feriasProximas = allEmployees.filter(emp => {
        if (!emp.proximaFerias) return false; 
        const feriasDate = new Date(emp.proximaFerias + 'T00:00:00');
        const diffMonths = (feriasDate.getFullYear() - now.getFullYear()) * 12 + (feriasDate.getMonth() - now.getMonth());
        return diffMonths >= 0 && diffMonths <= 3;
    });

    // STUB: Banco de Horas (Dados Fictícios/Simulados)
    const bancoHorasGeral = allEmployees.map(emp => ({
        nome: emp.nomeCompleto,
        saldoMes: Math.floor(Math.random() * 300 - 150), // Ex: -150 a +150 minutos
    }));
    const devedoresCriticos = bancoHorasGeral.filter(b => b.saldoMes < -60).slice(0, 5);


    el.innerHTML = `
        <h1 class="text-3xl font-bold mb-8 text-slate-800">Dashboard</h1>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div class="bg-white p-6 rounded shadow border-l-4 border-blue-500">
                <h3 class="text-gray-500 text-sm font-bold uppercase">Total Colaboradores</h3>
                <p class="text-3xl font-bold text-slate-800">${total}</p>
            </div>
            <div class="bg-white p-6 rounded shadow border-l-4 border-green-500">
                <h3 class="text-gray-500 text-sm font-bold uppercase">Lojas Cadastradas</h3>
                <p class="text-3xl font-bold text-slate-800">${struct.stores.length}</p>
            </div>
            <div class="bg-white p-6 rounded shadow border-l-4 border-purple-500">
                <h3 class="text-gray-500 text-sm font-bold uppercase">Aniversariantes Mês</h3>
                <p class="text-3xl font-bold text-slate-800">${aniversariantes.length}</p>
            </div>
            <div class="bg-white p-6 rounded shadow border-l-4 border-orange-500">
                <h3 class="text-gray-500 text-sm font-bold uppercase">Devedores Críticos</h3>
                <p class="text-3xl font-bold text-slate-800">${devedoresCriticos.length}</p>
            </div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            <div class="bg-white p-6 rounded shadow">
                <h3 class="font-bold mb-4 text-purple-700 flex justify-between items-center">
                    Aniversariantes em ${now.toLocaleDateString('pt-BR', { month: 'long' })} 🎂
                </h3>
                <ul class="space-y-2 text-sm" id="list-aniversariantes">
                    ${aniversariantes.map(emp =>
                        `<li class="flex justify-between border-b pb-1 last:border-b-0">${emp.nomeCompleto} <span class="font-bold">${new Date(emp.dataNascimento + 'T00:00:00').getDate()}</span></li>`
                    ).join('') || '<li class="text-gray-500">Nenhum aniversariante encontrado.</li>'}
                </ul>
            </div>

            <div class="bg-white p-6 rounded shadow">
                <h3 class="font-bold mb-4 text-teal-700">Próximas Férias (3 meses) 🏖️</h3>
                <ul class="space-y-2 text-sm" id="list-ferias">
                    ${feriasProximas.map(emp =>
                        `<li class="flex justify-between border-b pb-1 last:border-b-0">${emp.nomeCompleto} <span class="font-bold text-teal-600">${new Date(emp.proximaFerias + 'T00:00:00').toLocaleDateString('pt-BR')}</span></li>`
                    ).join('') || '<li class="text-gray-500">Nenhuma férias agendada.</li>'}
                </ul>
            </div>

            <div class="bg-white p-6 rounded shadow">
                <h3 class="font-bold mb-4 text-red-700">Banco de Horas - Devedores > 1h 📉</h3>
                <ul class="space-y-2 text-sm" id="list-banco-horas-ajuste">
                    ${devedoresCriticos.map(b =>
                        `<li class="flex justify-between border-b pb-1 last:border-b-0">${b.nome} <span class="font-bold text-red-600">${formatMinutesToHHMM(b.saldoMes)}</span></li>`
                    ).join('') || '<li class="text-gray-500">Nenhum saldo crítico detectado.</li>'}
                </ul>
            </div>
        </div>
    `;
}

// ====================================================================
// MÓDULO 2: CONFIG COMPANY (Logo, Dados)
// ====================================================================
function renderConfigCompany(el) {
    el.innerHTML = `
        <h1 class="text-3xl font-bold mb-8 text-slate-800">Configurações da Empresa</h1>
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
        if(file.size > 100000) return showAlert('Imagem muito grande! Use arquivo menor que 100KB.', 'error');
        try {
            logoBase64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        } catch (e) {
            return showAlert('Erro ao ler o arquivo.', 'error');
        }
    }

    const data = {
        nome: document.getElementById('c-nome').value,
        cnpj: document.getElementById('c-cnpj').value,
        logo: logoBase64
    };

    if(company.id) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', company.id), data);
    else await addDoc(getColl('config'), data);
    
    await loadCompany();
    showAlert('Salvo com sucesso!', 'success');
    router('config-company');
};


// ====================================================================
// MÓDULO 3: CONFIG STRUCTURE (Cargos, Lojas, Feriados, etc.)
// ====================================================================
function renderConfigStruct(el) {
    el.innerHTML = `
        <h1 class="text-3xl font-bold mb-8 text-slate-800">Estrutura Operacional</h1>
        <div class="bg-white p-6 rounded shadow h-full flex flex-col">
            <div class="flex border-b mb-4 text-sm overflow-x-auto">
                <button onclick="openTab(event, 'tab-est')" class="px-4 py-2 border-b-2 border-blue-500 font-bold tab-btn">Estados</button>
                <button onclick="openTab(event, 'tab-carg')" class="px-4 py-2 border-b-2 border-transparent hover:border-gray-300 tab-btn">Cargos</button>
                <button onclick="openTab(event, 'tab-rede')" class="px-4 py-2 border-b-2 border-transparent hover:border-gray-300 tab-btn">Redes & Lojas</button>
                <button onclick="openTab(event, 'tab-fer')" class="px-4 py-2 border-b-2 border-transparent hover:border-gray-300 tab-btn">Feriados</button>
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

window.openTab = (event, tid) => {
    document.querySelectorAll('.tab-content').forEach(d => d.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => { 
        b.classList.remove('border-blue-500','font-bold'); 
        b.classList.add('border-transparent'); 
    });
    document.getElementById(tid).classList.remove('hidden');
    event.currentTarget.classList.add('border-blue-500','font-bold');
    event.currentTarget.classList.remove('border-transparent');
}

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
        <li class="flex justify-between bg-gray-50 p-2 rounded mb-1 text-sm border-l-4 border-green-500">
            <div><b>${s.name}</b> <span class="text-xs text-gray-500">(${s.network}) - ${s.city}/${s.state}</span></div>
            <button onclick="delStruct('stores','${s.id}')" class="text-red-500"><i class="fa-solid fa-trash"></i></button>
        </li>`).join('');
    return `
        <div class="space-y-2 mb-2 bg-gray-50 p-3 rounded">
            <input id="store-name" class="border p-1 w-full text-sm" placeholder="Nome Loja" required>
            <select id="store-net" class="border p-1 w-full text-sm" required><option value="">Rede...</option>${struct.networks.map(n=>`<option>${n.name}</option>`).join('')}</select>
            <div class="flex gap-1">
                <select id="store-uf" class="border p-1 w-1/3 text-sm" required><option value="">UF</option>${struct.states.map(s=>`<option>${s.name}</option>`).join('')}</select>
                <input id="store-city" class="border p-1 w-2/3 text-sm" placeholder="Município" required>
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
            <button onclick="delStruct('holidays','${h.id}')" class="text-red-500"><i class="fa-solid fa-trash"></i></button>
        </li>`).join('');
    return `
        <div class="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4 bg-gray-50 p-3 rounded items-end">
            <div><label class="text-xs font-semibold">Data</label><input type="date" id="hol-date" class="border p-1 w-full text-sm"></div>
            <div><label class="text-xs font-semibold">Nome</label><input id="hol-name" class="border p-1 w-full text-sm"></div>
            <div><label class="text-xs font-semibold">Tipo</label><select id="hol-type" class="border p-1 w-full text-sm"><option>Nacional</option><option>Estadual</option><option>Municipal</option></select></div>
            <div><label class="text-xs font-semibold">Escopo (UF/Mun)</label><input id="hol-scope" class="border p-1 w-full text-sm" placeholder="Ex: SP ou Campinas"></div>
        </div>
        <button onclick="addHoliday()" class="bg-blue-600 text-white px-4 py-2 rounded text-sm w-full mb-2">Salvar Feriado</button>
        <ul class="max-h-60 overflow-y-auto">${list}</ul>
    `;
}

window.addStruct = async (coll) => {
    const val = document.getElementById('new-'+coll).value.trim();
    if(!val) return showAlert('Preencha o campo.', 'warning');
    await addDoc(getColl(coll), {name:val});
    await loadStruct(); 
    showAlert('Item adicionado.', 'success', 1500);
    router('config-struct'); // Recarrega a view
};
window.addStore = async () => {
    const name = document.getElementById('store-name').value.trim();
    const net = document.getElementById('store-net').value;
    const uf = document.getElementById('store-uf').value;
    const city = document.getElementById('store-city').value.trim();
    if(!name || !net || !uf || !city) return showAlert('Preencha todos os campos da loja.', 'warning');
    await addDoc(getColl('stores'), {name, network:net, state:uf, city});
    await loadStruct(); 
    showAlert('Loja adicionada.', 'success', 1500);
    router('config-struct');
};
window.addHoliday = async () => {
    const d = document.getElementById('hol-date').value;
    const n = document.getElementById('hol-name').value.trim();
    const t = document.getElementById('hol-type').value;
    const s = document.getElementById('hol-scope').value.trim();
    if(!d || !n) return showAlert('Preencha a Data e o Nome do Feriado.', 'warning');
    await addDoc(getColl('holidays'), {date:d, name:n, type:t, scope:s});
    await loadStruct(); 
    showAlert('Feriado salvo.', 'success', 1500);
    router('config-struct');
};
window.delStruct = async (c, id) => { 
    if(confirm('Tem certeza que deseja apagar? Esta ação é irreversível e pode afetar os colaboradores. (Simulação)')) { 
        // Na vida real, verificaria dependências em 'employees' antes de apagar.
        await deleteDoc(doc(db,'artifacts',appId,'public','data',c,id)); 
        await loadStruct(); 
        showAlert('Item apagado.', 'success', 1500);
        router('config-struct'); 
    }
};

// ====================================================================
// MÓDULO 4: RH (COLABORADORES)
// ====================================================================
async function renderRH(el) {
    const snap = await getDocs(getColl('employees'));
    employees = snap.docs.map(d => ({id:d.id, ...d.data()}));
    
    el.innerHTML = `
        <h1 class="text-3xl font-bold mb-8 text-slate-800">Gestão de Colaboradores</h1>
        <div class="bg-white rounded shadow p-6">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold">Lista de Colaboradores</h2>
                <button onclick="openEmpModal()" class="bg-green-600 text-white px-4 py-2 rounded flex gap-2 items-center hover:bg-green-700">
                    <i class="fa-solid fa-user-plus"></i> Novo Cadastro
                </button>
            </div>
            
            <div class="overflow-x-auto">
                <table class="w-full text-sm text-left">
                    <thead class="bg-gray-100 uppercase">
                        <tr>
                            <th class="p-3">Nome/CPF</th>
                            <th class="p-3 hidden sm:table-cell">Cargo</th>
                            <th class="p-3 hidden md:table-cell">Local</th>
                            <th class="p-3 hidden lg:table-cell">Acesso</th>
                            <th class="p-3">Ação</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${employees.map(e => `
                        <tr class="border-b hover:bg-gray-50">
                            <td class="p-3">
                                <div class="font-bold">${e.nomeCompleto}</div>
                                <div class="text-xs text-gray-500">${e.cpf}</div>
                            </td>
                            <td class="p-3 hidden sm:table-cell">${e.cargo}</td>
                            <td class="p-3 hidden md:table-cell">${e.municipio}/${e.estado}</td>
                            <td class="p-3 font-mono text-xs hidden lg:table-cell">U: ${e.loginUser}<br>S: ${e.loginPass}</td>
                            <td class="p-3 whitespace-nowrap">
                                <button onclick="openEmpModal('${e.id}')" class="text-blue-600 hover:text-blue-800 mr-2"><i class="fa-solid fa-pen"></i> Editar</button>
                                <button onclick="delEmp('${e.id}')" class="text-red-600 hover:text-red-800"><i class="fa-solid fa-trash"></i></button>
                            </td>
                        </tr>`).join('')}
                        ${employees.length === 0 ? '<tr><td colspan="5" class="p-4 text-center text-gray-500">Nenhum colaborador cadastrado.</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

window.openEmpModal = (id) => {
    const emp = id ? employees.find(e => e.id===id) : {};
    const isEdit = !!id;
    
    // Geração de credenciais aleatórias para novos cadastros
    const genUser = emp.loginUser || `user${Math.floor(Math.random()*9000)+1000}`;
    const genPass = emp.loginPass || Math.random().toString(36).slice(-6);

    document.getElementById('modal-content').innerHTML = `
        <div class="p-6 bg-white max-h-[90vh] overflow-y-auto">
            <h2 class="text-xl font-bold mb-4 border-b pb-2">${isEdit ? 'Editar' : 'Novo'} Colaborador</h2>
            <form id="form-emp" class="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                <div class="md:col-span-3 font-bold text-blue-600 mt-2 border-b pb-1">Dados Pessoais & Contratuais</div>
                <input id="e-nome" value="${emp.nomeCompleto||''}" class="border p-2 rounded col-span-3" placeholder="Nome Completo" required>
                <input id="e-nasc" value="${emp.dataNascimento||''}" type="date" class="border p-2 rounded" title="Data de Nascimento">
                <input id="e-cpf" value="${emp.cpf||''}" class="border p-2 rounded" placeholder="CPF">
                <input id="e-rg" value="${emp.rg||''}" class="border p-2 rounded" placeholder="RG">
                <input id="e-pis" value="${emp.nisPIS||''}" class="border p-2 rounded" placeholder="NIS/PIS">
                <input id="e-end" value="${emp.endereco||''}" class="border p-2 rounded col-span-3" placeholder="Endereço (Rua, Número)">
                <select id="e-uf" class="border p-2 rounded" required><option value="">Estado (UF)</option>${struct.states.map(s=>`<option ${emp.estado===s.name?'selected':''}>${s.name}</option>`).join('')}</select>
                <input id="e-mun" value="${emp.municipio||''}" class="border p-2 rounded" placeholder="Município">

                <div class="md:col-span-3 font-bold text-blue-600 mt-4 border-b pb-1">Configuração de Acesso & Ponto</div>
                <div class="md:col-span-3 grid grid-cols-2 gap-4">
                    <input id="e-login-user" value="${genUser}" class="border p-2 rounded bg-gray-100" placeholder="Usuário (Login)" readonly title="Usuário de Login">
                    <input id="e-login-pass" value="${genPass}" class="border p-2 rounded bg-gray-100" placeholder="Senha (Login)" readonly title="Senha de Login">
                </div>
                
                <select id="e-cargo" onchange="toggleStoreSelect(this.value, '${emp.id}')" class="border p-2 rounded" required><option value="">Cargo</option>${struct.roles.map(r=>`<option ${emp.cargo===r.name?'selected':''}>${r.name}</option>`).join('')}</select>
                
                <div class="flex gap-2 items-center">
                    <label class="text-sm font-semibold">Jornada Padrão (HH:MM)</label>
                    <input id="e-jornada" value="${emp.jornadaHHMM||'08:00'}" pattern="[0-9]{2}:[0-9]{2}" class="border p-2 rounded w-24" required>
                </div>

                <div class="flex items-center gap-4">
                    <label class="text-sm font-semibold">Selfie Obrigatória</label>
                    <input type="checkbox" id="e-selfie" class="h-4 w-4 rounded" ${emp.selfieObrigatoria?'checked':''}>
                </div>

                <div class="md:col-span-3 pt-2">
                    <label class="text-sm font-semibold block mb-2">Padrão de Batidas:</label>
                    <div class="flex gap-4">
                        <label class="inline-flex items-center"><input type="radio" name="batidas-padrao" value="2" class="form-radio h-4 w-4 text-blue-600" ${emp.batidasPadrao==='2'?'checked':''}> <span class="ml-2">2 Batidas (Entrada/Saída)</span></label>
                        <label class="inline-flex items-center"><input type="radio" name="batidas-padrao" value="4" class="form-radio h-4 w-4 text-blue-600" ${emp.batidasPadrao!=='2'?'checked':''}> <span class="ml-2">4 Batidas (Entrada/Almoço/Volta/Saída)</span></label>
                    </div>
                </div>

                <div class="md:col-span-3 font-bold text-blue-600 mt-4 border-b pb-1">Vinculação de Lojas (Roteiristas/Fixo)</div>
                <div id="store-selector" class="md:col-span-3 p-2 border rounded bg-gray-50 min-h-[50px] overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <p class="text-gray-500 italic">Selecione um cargo primeiro.</p>
                </div>

                <div class="md:col-span-3 flex justify-end gap-3 mt-4 border-t pt-4">
                    <button type="button" onclick="document.getElementById('modal-overlay').classList.add('hidden')" class="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancelar</button>
                    <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700">Salvar Cadastro</button>
                </div>
            </form>
        </div>
    `;
    
    document.getElementById('modal-overlay').classList.remove('hidden'); 
    
    // Preenche o seletor de lojas na edição
    if(emp.cargo) window.toggleStoreSelect(emp.cargo, id);
    
    document.getElementById('form-emp').onsubmit = (e) => saveEmployee(e, id, genUser, genPass);
};

window.toggleStoreSelect = (cargo, empId) => {
    const container = document.getElementById('store-selector');
    const isRoteirista = cargo.toLowerCase().includes('roteirista');
    
    const emp = employees.find(e => e.id===empId) || {};
    const savedStores = emp.storeIds || [];

    if(!cargo) {
        container.innerHTML = '<p class="text-gray-500 italic">Selecione um cargo primeiro.</p>';
        return;
    }

    container.innerHTML = struct.stores.map(s => `
        <label class="flex items-center gap-2 p-1 hover:bg-white rounded cursor-pointer">
            <input type="${isRoteirista ? 'checkbox' : 'radio'}" name="sel_stores" value="${s.id}" class="h-4 w-4 rounded text-blue-600" ${savedStores.includes(s.id)?'checked':''}>
            <span><b>${s.name}</b> (${s.network}) - ${s.city}/${s.state}</span>
        </label>
    `).join('');

    if (!isRoteirista) {
        container.innerHTML += '<p class="mt-2 text-xs text-orange-500 md:col-span-2">Para Promotor Fixo, apenas uma loja pode ser selecionada.</p>';
    }
};

const saveEmployee = async (e, id, loginUser, loginPass) => {
    e.preventDefault();
    const isEdit = !!id;

    const selectedStores = Array.from(document.querySelectorAll('input[name="sel_stores"]:checked')).map(cb => cb.value);
    const cargo = document.getElementById('e-cargo').value;

    const isRoteirista = cargo.toLowerCase().includes('roteirista');
    
    if(!isRoteirista && selectedStores.length > 1) {
        return showAlert('Para um cargo que não é Roteirista, selecione apenas uma loja.', 'warning');
    }
    if(selectedStores.length === 0) {
         return showAlert('Selecione pelo menos uma loja de vinculação.', 'warning');
    }

    const data = {
        nomeCompleto: document.getElementById('e-nome').value.trim(),
        dataNascimento: document.getElementById('e-nasc').value,
        cpf: document.getElementById('e-cpf').value.trim(),
        rg: document.getElementById('e-rg').value.trim(),
        nisPIS: document.getElementById('e-pis').value.trim(),
        endereco: document.getElementById('e-end').value.trim(),
        estado: document.getElementById('e-uf').value,
        municipio: document.getElementById('e-mun').value.trim(),
        cargo: cargo,
        jornadaHHMM: document.getElementById('e-jornada').value,
        loginUser: loginUser,
        loginPass: loginPass,
        storeIds: selectedStores,
        batidasPadrao: document.querySelector('input[name="batidas-padrao"]:checked')?.value || '4',
        selfieObrigatoria: document.getElementById('e-selfie').checked,
        // Campos de Admissão e Proxima Ferias
        dataAdmissao: document.getElementById('e-admissao')?.value || '2025-01-01', // STUB: Adicionar ao modal
        proximaFerias: document.getElementById('e-ferias')?.value || '2026-01-01', // STUB: Adicionar ao modal
        lastUpdated: serverTimestamp(),
    };

    try {
        if(isEdit) {
            await updateDoc(doc(db,'artifacts',appId,'public','data','employees',id), data);
        } else {
            await addDoc(getColl('employees'), data);
        }
        showAlert(`Colaborador ${isEdit ? 'atualizado' : 'cadastrado'} com sucesso.`, 'success');
        document.getElementById('modal-overlay').classList.add('hidden');
        router('rh'); // Recarrega a lista
    } catch (error) {
        showAlert('Erro ao salvar: ' + error.message, 'error');
    }
};

window.delEmp = async (id) => { 
    if(confirm('Tem certeza que deseja apagar este colaborador e todos os seus registros de ponto?')) { 
        await deleteDoc(doc(db,'artifacts',appId,'public','data','employees',id)); 
        // STUB: Apagar também os pontos vinculados na coleção 'pontos'
        showAlert('Colaborador apagado.', 'success');
        router('rh'); 
    }
};


// ====================================================================
// MÓDULO 5: RELATÓRIOS
// ====================================================================
async function renderReports(el) {
    // Carrega colaboradores novamente (ou usa a cache)
    const snap = await getDocs(getColl('employees'));
    employees = snap.docs.map(d => ({id:d.id, ...d.data()}));

    // Preenche o mês atual como default
    const now = new Date();
    const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    el.innerHTML = `
        <h1 class="text-3xl font-bold mb-8 text-slate-800">Geração de Relatórios de Ponto</h1>
        <div class="bg-white p-6 rounded shadow">
            <h2 class="text-xl font-bold mb-4 border-b pb-2">Filtros e Geração em Lote</h2>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 items-end">
                <div>
                    <label class="text-sm font-semibold block">Mês/Ano do Relatório</label>
                    <input type="month" id="report-month" value="${monthYear}" class="border p-2 rounded w-full">
                </div>
                <div>
                    <label class="text-sm font-semibold block">Filtrar por Estado</label>
                    <select id="report-filter-estado" class="border p-2 rounded w-full">
                        <option value="all">Todos os Estados</option>
                        ${struct.states.map(s => `<option>${s.name}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="text-sm font-semibold block">Filtrar por Cargo</label>
                    <select id="report-filter-cargo" class="border p-2 rounded w-full">
                        <option value="all">Todos os Cargos</option>
                        ${struct.roles.map(r => `<option>${r.name}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <button onclick="loadEmployeesForReports()" class="bg-blue-600 text-white px-4 py-2 rounded w-full hover:bg-blue-700">Buscar Colaboradores</button>
                </div>
            </div>

            <div id="report-employees-list" class="hidden mt-6">
                <h3 class="font-bold mb-3">Colaboradores para Geração</h3>
                <div class="flex justify-between items-center mb-4">
                    <label class="inline-flex items-center">
                        <input type="checkbox" id="select-all-reports" class="h-4 w-4 text-blue-600 rounded" onchange="document.querySelectorAll('.report-checkbox').forEach(cb => cb.checked = this.checked)">
                        <span class="ml-2 text-sm font-semibold">Selecionar Todos</span>
                    </label>
                    <button onclick="generateBatchReports()" class="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700">Gerar Relatórios Selecionados</button>
                </div>
                
                <div class="overflow-y-auto max-h-96 border rounded">
                    <table class="w-full text-sm text-left">
                        <thead class="bg-gray-100 uppercase sticky top-0">
                            <tr>
                                <th class="p-3 w-10">Sel</th>
                                <th class="p-3">Nome</th>
                                <th class="p-3">Cargo</th>
                                <th class="p-3 no-print">Ação</th>
                            </tr>
                        </thead>
                        <tbody id="report-employee-table-body">
                            </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    // Chama para preencher a lista inicial (sem filtros)
    loadEmployeesForReports(); 
}

window.loadEmployeesForReports = async () => {
    const listContainer = document.getElementById('report-employees-list');
    const tableBody = document.getElementById('report-employee-table-body');
    const filterEstado = document.getElementById('report-filter-estado').value;
    const filterCargo = document.getElementById('report-filter-cargo').value;

    listContainer.classList.add('hidden');
    tableBody.innerHTML = '<tr><td colspan="4" class="p-4 text-center"><div class="loader mx-auto"></div> Carregando...</td></tr>';

    let filteredEmployees = employees;
    if (filterEstado !== 'all') {
        filteredEmployees = filteredEmployees.filter(e => e.estado === filterEstado);
    }
    if (filterCargo !== 'all') {
        filteredEmployees = filteredEmployees.filter(e => e.cargo === filterCargo);
    }
    
    filteredEmployees.sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto));

    tableBody.innerHTML = filteredEmployees.map(emp => `
        <tr class="hover:bg-gray-50">
            <td class="py-2 px-4"><input type="checkbox" class="report-checkbox h-4 w-4 text-blue-600 rounded" data-id="${emp.id}"></td>
            <td class="py-2 px-4">${emp.nomeCompleto}</td>
            <td class="py-2 px-4">${emp.cargo || '-'}</td>
            <td class="py-2 px-4 no-print">
                <button onclick="generateSingleReport('${emp.id}', document.getElementById('report-month').value, false)" class="bg-gray-200 text-gray-800 px-3 py-1 rounded text-xs hover:bg-gray-300">Gerar</button>
            </td>
        </tr>
    `).join('');
    listContainer.classList.remove('hidden');
    document.getElementById('select-all-reports').checked = false;
}

window.generateBatchReports = async () => {
    const selectedMonth = document.getElementById('report-month').value;
    if (!selectedMonth) return showAlert('Selecione um mês para o relatório.', 'warning');

    const selectedIds = Array.from(document.querySelectorAll('.report-checkbox:checked'))
        .map(cb => cb.dataset.id);

    if (selectedIds.length === 0) return showAlert('Selecione pelo menos um colaborador.', 'warning');

    showAlert(`Gerando ${selectedIds.length} relatórios para ${selectedMonth}. O navegador pode solicitar permissão para abrir múltiplas janelas.`, 'info', 8000);

    for (const id of selectedIds) {
        // Encontra o objeto do colaborador
        const emp = employees.find(e => e.id === id);
        if (emp) {
            await generateSingleReport(id, selectedMonth, true); // true = autoPrint/open new window
        }
    }
    showAlert('Geração de relatórios em lote finalizada.', 'success');
};


// Chamador do relatório individual (busca os dados primeiro)
window.generateSingleReport = async (id, monthYear, autoPrint = false) => {
    const employee = employees.find(e => e.id === id);
    if (!employee) return showAlert(`Colaborador ID ${id} não encontrado.`, 'error');

    // Mês e Ano do relatório
    const [year, month] = monthYear.split('-').map(Number);
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0);

    // Busca os pontos do colaborador no período
    const pontoQuery = query(
        getColl('pontos'), 
        where('employeeId', '==', id),
        where('timestamp', '>=', startOfMonth),
        where('timestamp', '<=', endOfMonth)
    );
    const pontosSnapshot = await getDocs(pontoQuery);
    // STUB: Em produção, os timestamps seriam tratados para virar objeto Date, aqui estou apenas simulando.
    const monthPoints = pontosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), d: doc.data().timestamp.toDate() }));
    
    
    let totalTimeWorkedMinutes = 0;
    let rows = '';
    const totalDays = endOfMonth.getDate();
    const [jornadaH, jornadaM] = employee.jornadaHHMM.split(':').map(Number);
    const jornadaMinutos = jornadaH * 60 + jornadaM;


    // Loop pelos dias do mês
    for (let i = 1; i <= totalDays; i++) {
        const date = new Date(year, month - 1, i);
        const dayStr = date.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}); // DD/MM
        const isoDate = date.toISOString().split('T')[0]; // YYYY-MM-DD
        const wd = date.getDay();
        const isSunday = wd === 0;
        const dayOfWeek = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');

        // Verifica Feriado (Nacional, Estadual e Municipal)
        const holiday = struct.holidays.find(h => {
            const hDate = h.date; // YYYY-MM-DD
            // Lógica de feriado só funciona para o ano do relatório
            if(hDate.slice(5) !== isoDate.slice(5)) return false; 
            if(h.type === 'Nacional') return true;
            if(h.type === 'Estadual' && h.scope === employee.estado) return true;
            if(h.type === 'Municipal' && h.scope.toLowerCase() === employee.municipio.toLowerCase()) return true;
            return false;
        }); 

        // Filtra pontos do dia
        const dayP = monthPoints.filter(p => p.d.getDate() === i).sort((a, b) => a.d.getTime() - b.d.getTime());
        
        // Formata as batidas (Ent1, Sai1, Ent2, Sai2)
        const getT = (index) => dayP[index] ? dayP[index].d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
        const ent1 = getT(0);
        const sai1 = getT(1);
        const ent2 = getT(2);
        const sai2 = getT(3);

        // Cálculo da Jornada do Dia (Simplificado para 4 batidas)
        let workMin = 0;
        if (dayP.length >= 2) {
            let period1 = 0;
            let period2 = 0;

            if (dayP[0] && dayP[1]) period1 = (dayP[1].d - dayP[0].d) / 60000;
            if (dayP[2] && dayP[3]) period2 = (dayP[3].d - dayP[2].d) / 60000;

            // Se for 2 batidas, calcula o total do dia
            if (dayP.length === 2) {
                workMin = period1;
            } else if (dayP.length >= 4) {
                workMin = period1 + period2;
            }
            workMin = Math.floor(workMin);
        }

        const isWorkingDay = !isSunday && !holiday;
        if (isWorkingDay) {
            totalTimeWorkedMinutes += workMin;
        }

        const obs = holiday ? `<span class="text-red-500 font-bold">${holiday.name}</span>` : (isSunday ? 'DSR' : '');

        rows += ` 
            <tr onclick="addEvent('${isoDate}')" class="cursor-pointer hover:bg-yellow-50 ${holiday ? 'bg-red-50' : (isSunday ? 'bg-gray-100' : (workMin !== jornadaMinutos && isWorkingDay ? 'bg-orange-50' : ''))}">
                <td class="p-1">${dayStr} (${dayOfWeek})</td>
                <td class="p-1">${ent1}</td>
                <td class="p-1">${sai1}</td>
                <td class="p-1">${ent2}</td>
                <td class="p-1">${sai2}</td>
                <td class="p-1 font-bold">${formatMinutesToHHMM(workMin)}</td>
                <td class="p-1 text-xs">${obs}</td>
            </tr>
        `;
    }
    
    const totalExpectedMinutes = jornadaMinutos * (totalDays - (struct.holidays.length + 4) * 4); // STUB: Cálculo de dias úteis simplificado
    const saldoMinutos = totalTimeWorkedMinutes - totalExpectedMinutes;
    const totalFaltantes = saldoMinutos < 0 ? Math.abs(saldoMinutos) : 0;
    const totalSobrando = saldoMinutos > 0 ? saldoMinutos : 0;


    // Montagem do HTML do Relatório (em uma nova janela para impressão)
    let reportHtml = `
        <html>
        <head>
            <title>Relatório Ponto - ${employee.nomeCompleto} - ${monthYear}</title>
            <link rel="stylesheet" href="style.css">
        </head>
        <body class="bg-white">
            <div class="report-container max-w-2xl mx-auto p-4 md:p-8">
                <div class="report-header-print text-center mb-4">
                    ${company.logo ? `<img src="${company.logo}" class="h-10 mx-auto mb-2">` : ''}
                    <h1 class="text-xl font-bold">${company.nome || 'RH Enterprise'}</h1>
                    <p class="text-sm">Relatório de Ponto Mensal - ${monthYear}</p>
                </div>
                
                <div class="report-data-print grid grid-cols-2 gap-2 text-sm mb-6 p-3 border rounded bg-gray-50">
                    <div><strong>Colaborador:</strong> ${employee.nomeCompleto}</div>
                    <div><strong>Cargo:</strong> ${employee.cargo}</div>
                    <div><strong>CPF:</strong> ${employee.cpf}</div>
                    <div><strong>Local:</strong> ${employee.municipio}/${employee.estado}</div>
                    <div><strong>Jornada Padrão:</strong> ${employee.jornadaHHMM}</div>
                </div>

                <h3 class="font-bold mb-2 text-md border-b pb-1">Batidas Diárias</h3>
                <table class="min-w-full divide-y divide-gray-200 text-center">
                    <thead class="bg-gray-200">
                        <tr><th>Dia</th><th>Ent1</th><th>Sai1</th><th>Ent2</th><th>Sai2</th><th>Total</th><th>Obs/Just.</th></tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
                
                <div class="mt-8 p-4 bg-gray-100 rounded print-only text-sm border border-slate-300">
                    <h3 class="font-bold mb-2">Resumo de Horas (Mês ${monthYear})</h3>
                    <div class="grid grid-cols-2 gap-2">
                        <p><strong>Total Horas a Trabalhar:</strong></p><p class="text-right font-bold">${formatMinutesToHHMM(totalExpectedMinutes)}</p>
                        <p><strong>Total Horas Trabalhado (Acumulado):</strong></p><p class="text-right font-bold">${formatMinutesToHHMM(totalTimeWorkedMinutes)}</p>
                        <hr class="col-span-2 my-1">
                        <p class="${totalFaltantes > 0 ? 'text-red-600 font-bold' : 'text-gray-600'}">
                            Total Horas Faltantes:
                        </p>
                        <p class="${totalFaltantes > 0 ? 'text-red-600 font-bold' : 'text-gray-600'} text-right">
                            ${formatMinutesToHHMM(totalFaltantes)}
                        </p>
                        <p class="${totalSobrando > 0 ? 'text-green-600 font-bold' : 'text-gray-600'}">
                            Total Horas Sobrando:
                        </p>
                        <p class="${totalSobrando > 0 ? 'text-green-600 font-bold' : 'text-gray-600'} text-right">
                            ${formatMinutesToHHMM(totalSobrando)}
                        </p>
                    </div>
                </div>

                <div class="signature-block mt-12 text-xs print-only text-center">
                    <p class="mb-6 text-gray-600">Reconheço como verdadeiras as informações contidas neste relatório.</p>
                    <div class="flex justify-around">
                        <div class="w-1/3 border-t border-black pt-2">Assinatura Colaborador</div>
                        <div class="w-1/3 border-t border-black pt-2">Assinatura Gestor</div>
                    </div>
                </div>
            </div>
            <button onclick="window.print()" class="no-print fixed bottom-8 right-8 bg-blue-600 text-white p-4 rounded-full shadow-xl hover:bg-blue-700"><i class="fa-solid fa-print"></i> Imprimir</button>
        </body></html>
    `;

    // Abre em nova janela e imprime, se necessário
    const newWindow = window.open('', '_blank');
    newWindow.document.write(reportHtml);
    newWindow.document.close();

    if (autoPrint) {
        newWindow.onload = () => {
            newWindow.print();
        };
    }
}

// ====================================================================
// MÓDULO 6: LINKS PÚBLICOS
// ====================================================================
function renderLinks(el) { 
    const base = window.location.href.split('?')[0]; 
    el.innerHTML = ` 
        <h1 class="text-3xl font-bold mb-8 text-slate-800">Links Públicos de Acesso</h1>
        <div class="bg-white p-6 rounded shadow max-w-2xl mx-auto"> 
            <h2 class="text-xl font-bold mb-6">Links de Acesso</h2> 
            
            <div class="mb-6 border-b pb-4"> 
                <h3 class="font-bold text-blue-600 flex items-center gap-2">📍 Quiosque de Ponto <span class="text-xs font-normal bg-blue-100 text-blue-800 px-2 py-0.5 rounded">/ponto</span></h3> 
                <p class="text-sm text-gray-500 mb-2">Para tablets ou computadores compartilhados. O colaborador precisa de suas credenciais (login/senha) para acessar.</p> 
                <div class="flex gap-2">
                    <input readonly value="${base}?mode=ponto" class="w-full bg-gray-100 p-2 text-sm border rounded">
                    <button class="bg-blue-100 text-blue-700 p-2 rounded hover:bg-blue-200 whitespace-nowrap" onclick="navigator.clipboard.writeText('${base}?mode=ponto')">Copiar</button>
                </div> 
            </div> 
            
            <div> 
                <h3 class="font-bold text-green-600 flex items-center gap-2">📝 Autocadastro <span class="text-xs font-normal bg-green-100 text-green-800 px-2 py-0.5 rounded">/autocadastro</span></h3> 
                <p class="text-sm text-gray-500 mb-2">Envie para novos candidatos preencherem os dados iniciais. Após o envio, o gestor deve revisar e finalizar o cadastro em 'Colaboradores'.</p> 
                <div class="flex gap-2">
                    <input readonly value="${base}?mode=autocadastro" class="w-full bg-gray-100 p-2 text-sm border rounded">
                    <button class="bg-green-100 text-green-700 p-2 rounded hover:bg-green-200 whitespace-nowrap" onclick="navigator.clipboard.writeText('${base}?mode=autocadastro')">Copiar</button>
                </div> 
            </div> 
        </div> 
    `; 
}


// ====================================================================
// MÓDULO 7: QUIOSQUE DE PONTO (isKiosk=true)
// ====================================================================

function renderKiosk(el) {
    if (!currentKioskUser) {
        // Tela de Login do Colaborador
        el.innerHTML = `
            <div class="max-w-md mx-auto bg-white p-8 rounded-lg shadow-2xl mt-20">
                <h2 class="text-2xl font-bold text-center mb-6 text-slate-800">Quiosque de Ponto</h2>
                <form id="form-login-ponto" class="space-y-4">
                    <input id="ponto-user" class="w-full border p-3 rounded" placeholder="Usuário (Login)" required>
                    <input id="ponto-pass" type="password" class="w-full border p-3 rounded" placeholder="Senha" required>
                    <button type="submit" id="ponto-login-btn" class="w-full py-3 bg-blue-600 text-white rounded font-bold hover:bg-blue-700">Entrar</button>
                    <p id="ponto-login-msg" class="text-red-500 text-center text-sm hidden"></p>
                </form>
            </div>
        `;
        document.getElementById('form-login-ponto').onsubmit = handlePontoLogin;
    } else {
        // Tela de Batida de Ponto
        const emp = currentKioskUser;
        const stores = emp.storeIds.map(id => struct.stores.find(s => s.id === id)).filter(s => s);

        el.innerHTML = `
            <div class="kiosk-container flex justify-center items-start h-full">
                <div class="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden mt-10">
                    <div class="bg-blue-600 p-6 text-white text-center">
                        <h2 class="text-2xl font-bold">Olá, ${emp.nomeCompleto.split(' ')[0]}</h2>
                        <p class="opacity-80 text-sm">${emp.cargo}</p>
                    </div>
                    <div class="p-8 text-center">
                        <div id="clock" class="text-5xl font-mono font-bold text-slate-700 mb-2">--:--</div>
                        <div id="date" class="text-gray-400 font-bold uppercase text-xs mb-8">--</div>
                        <div id="last-reg" class="bg-gray-100 p-2 rounded text-sm mb-6">
                            Último Ponto: <span id="last-st" class="font-bold">...</span>
                        </div>
                        
                        <div id="store-select-container" class="mb-6">
                            ${stores.length > 1 ? `
                                <select id="ponto-store-select" class="w-full border p-2 rounded text-sm bg-white" required>
                                    <option value="">Selecione a Loja/Rede</option>
                                    ${stores.map(s => `<option value="${s.id}">${s.name} (${s.network})</option>`).join('')}
                                </select>
                            ` : `<p class="text-sm text-gray-600">Loja Vinculada: <b>${stores[0]?.name || 'N/A'}</b></p><input type="hidden" id="ponto-store-select" value="${stores[0]?.id || ''}">`}
                        </div>

                        <button onclick="hitPonto()" id="btn-hit" class="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-xl font-bold text-xl transition transform active:scale-95"> 
                            REGISTRAR PONTO 
                        </button>

                        <p class="text-xs text-red-500 mt-2">Selfie ${emp.selfieObrigatoria ? 'OBRIGATÓRIA' : 'Opcional'} | Padrão: ${emp.batidasPadrao} Batidas</p>

                        <button onclick="logoutPonto()" class="mt-6 text-gray-400 text-sm hover:text-red-500 underline">Sair / Trocar Conta</button>
                    </div>
                </div>
            </div>
        `;

        // Inicia o relógio
        setInterval(() => { 
            const d = new Date(); 
            if(document.getElementById('clock')) { 
                document.getElementById('clock').innerText = d.toLocaleTimeString('pt-BR'); 
                document.getElementById('date').innerText = d.toLocaleDateString('pt-BR',{weekday:'long', day:'numeric', month:'long'}); 
            }
        }, 1000);
        // Atualiza o último registro (STUB)
        document.getElementById('last-st').innerText = '00:00 (Entrada)';
    }
}

const handlePontoLogin = async (e) => {
    e.preventDefault();
    const u = document.getElementById('ponto-user').value;
    const p = document.getElementById('ponto-pass').value;
    const msgEl = document.getElementById('ponto-login-msg');
    
    msgEl.innerText = "Verificando...";
    msgEl.classList.remove('hidden');

    const q = query(getColl('employees'), where('loginUser', '==', u), where('loginPass', '==', p));
    const snap = await getDocs(q);

    if (!snap.empty) {
        currentKioskUser = { id: snap.docs[0].id, ...snap.docs[0].data() };
        renderKiosk(document.getElementById('app-content'));
        showAlert(`Bem-vindo(a), ${currentKioskUser.nomeCompleto.split(' ')[0]}!`, 'success');
    } else {
        msgEl.innerText = "Usuário ou senha inválidos.";
    }
};

window.logoutPonto = () => {
    currentKioskUser = null;
    renderKiosk(document.getElementById('app-content'));
};

window.hitPonto = async () => {
    if (!currentKioskUser) return showAlert('Erro: Colaborador não logado.', 'error');
    
    const storeId = document.getElementById('ponto-store-select')?.value;
    if (!storeId) return showAlert('Selecione uma loja para bater o ponto.', 'warning');

    document.getElementById('btn-hit').textContent = 'Registrando...';
    
    // STUB: Lógica de Checagem de Batida (tipo) e Selfie
    // Na vida real, a selfie seria capturada aqui (usando a WebCam API).
    const tipoBatida = 'Entrada'; // STUB: Deveria ser determinado pela última batida
    
    const pontoData = {
        employeeId: currentKioskUser.id,
        storeId: storeId,
        timestamp: serverTimestamp(),
        tipo: tipoBatida,
        // selfieUrl: '...', // Se selfieObrigatoria for true
        location: { // STUB: Obter localização via Geolocation API
            lat: -5.795,
            lon: -35.201,
            // accuracy: ...
        }
    };
    
    try {
        await addDoc(getColl('pontos'), pontoData);
        showAlert(`Ponto de ${tipoBatida} registrado com sucesso!`, 'success', 4000);
        document.getElementById('last-st').innerText = `${new Date().toLocaleTimeString('pt-BR')} (${tipoBatida})`;
    } catch (error) {
        showAlert('Erro ao registrar ponto: ' + error.message, 'error');
    } finally {
        document.getElementById('btn-hit').textContent = 'REGISTRAR PONTO';
    }
};

// ====================================================================
// MÓDULO 8: AUTOCADASTRO (isAuto=true)
// ====================================================================
function renderAutoCadastro(el) {
    el.innerHTML = `
        <div class="max-w-xl mx-auto bg-white p-8 rounded-lg shadow-2xl mt-10">
            <h2 class="text-2xl font-bold text-center mb-6 text-green-700">Formulário de Autocadastro</h2>
            <p class="text-center text-gray-600 mb-6">Preencha seus dados para iniciar seu cadastro na empresa.</p>
            <form id="form-autocadastro" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                <input id="a-nome" class="border p-2 rounded col-span-2" placeholder="Nome Completo" required>
                <input id="a-nasc" type="date" class="border p-2 rounded" title="Data de Nascimento" required>
                <input id="a-cpf" class="border p-2 rounded" placeholder="CPF" required>
                <input id="a-rg" class="border p-2 rounded" placeholder="RG" required>
                <input id="a-pis" class="border p-2 rounded" placeholder="NIS/PIS">
                
                <input id="a-end" class="border p-2 rounded col-span-2" placeholder="Endereço (Rua, Número)" required>
                <select id="a-uf" class="border p-2 rounded" required><option value="">Estado (UF)</option>${struct.states.map(s=>`<option>${s.name}</option>`).join('')}</select>
                <input id="a-mun" class="border p-2 rounded" placeholder="Município" required>

                <div class="md:col-span-2 mt-4">
                    <button type="submit" id="a-btn" class="w-full py-3 bg-green-600 text-white rounded font-bold hover:bg-green-700">Enviar Cadastro</button>
                </div>
            </form>
        </div>
    `;
    document.getElementById('form-autocadastro').onsubmit = handleAutoCadastro;
}

const handleAutoCadastro = async (e) => {
    e.preventDefault();
    document.getElementById('a-btn').textContent = 'Enviando...';

    // Gera credenciais provisórias
    const genUser = `user${Math.floor(Math.random()*9000)+1000}`;
    const genPass = Math.random().toString(36).slice(-6);
    
    const data = {
        nomeCompleto: document.getElementById('a-nome').value.trim(),
        cpf: document.getElementById('a-cpf').value.trim(),
        rg: document.getElementById('a-rg').value.trim(),
        dataNascimento: document.getElementById('a-nasc').value,
        nisPIS: document.getElementById('a-pis').value.trim(),
        endereco: document.getElementById('a-end').value.trim(),
        estado: document.getElementById('a-uf').value,
        municipio: document.getElementById('a-mun').value.trim(),
        loginUser: genUser,
        loginPass: genPass,
        cargo: 'Novo (Aguardando)', // Default
        jornadaHHMM: '08:00', // Default
        batidasPadrao: '4', // Default
        selfieObrigatoria: false, // Default
        dataCadastro: serverTimestamp(),
    };
    
    try {
        await addDoc(getColl('employees'), data);
        document.getElementById('app-content').innerHTML = `
            <div class="max-w-md mx-auto bg-white p-8 rounded shadow text-center mt-20">
                <i class="fa-solid fa-check-circle text-5xl text-green-500 mb-4"></i>
                <h2 class="text-2xl font-bold">Cadastro Realizado!</h2>
                <p class="text-gray-600 mt-2">Seus dados foram enviados. Um gestor fará a revisão e ativará sua conta.</p>
                <p class="text-sm text-red-500 mt-4 font-bold">ANOTE SUAS CREDENCIAIS PROVISÓRIAS:</p>
                <div class="bg-gray-100 p-4 rounded mt-2 font-mono text-lg border border-dashed border-gray-400">
                    <p>Usuário: <b>${genUser}</b></p>
                    <p>Senha: <b>${genPass}</b></p>
                </div>
            </div>
        `;
    } catch (error) {
        showAlert('Erro ao enviar o cadastro: ' + error.message, 'error');
        document.getElementById('a-btn').textContent = 'Enviar Cadastro';
    }
};

// ====================================================================
// FUNÇÕES GLOBAIS DE SIMULAÇÃO (Para usar no console ou onclick)
// ====================================================================
window.formatMinutesToHHMM = formatMinutesToHHMM; // Expõe a função para uso no console/onclick
window.addEvent = (dateIso) => { 
    showAlert("Observação registrada (Simulação: em produção salvaria no DB).", 'info', 3000);
};
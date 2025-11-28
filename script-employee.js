import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, getDocs, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
let company = {}, currentEmployee = null;
let isKiosk = false, isAutoCadastro = false;

// INIT
async function init() {
    const params = new URLSearchParams(window.location.search);
    isKiosk = params.get('mode') === 'ponto';
    isAutoCadastro = params.get('mode') === 'autocadastro';

    await signInAnonymously(auth);

    onAuthStateChanged(auth, async (u) => {
        if(u) {
            await loadCompany();
            
            if(isKiosk) return renderKiosk(document.getElementById('app-content'));
            if(isAutoCadastro) return renderAutoCadastro(document.getElementById('app-content'));
            
            // Normal Employee Flow
            const savedAuth = JSON.parse(localStorage.getItem('employee_auth'));
            if(savedAuth) {
                currentEmployee = savedAuth;
                showEmployeePanel();
            } else {
                document.getElementById('login-screen').classList.remove('hidden');
                document.getElementById('login-screen').classList.add('flex');
            }
        }
    });
}

// --- DATA LOADERS ---
async function loadCompany() {
    const snap = await getDocs(getColl('config'));
    company = snap.empty ? {nome:'Minha Empresa', logo:''} : {id:snap.docs[0].id, ...snap.docs[0].data()};
}

// --- EMPLOYEE AUTH ---
document.getElementById('form-login').onsubmit = async (e) => {
    e.preventDefault();
    const u = document.getElementById('login-user').value;
    const p = document.getElementById('login-pass').value;
    
    if(!u || !p) {
        document.getElementById('login-msg').innerText = "Preencha todos os campos";
        document.getElementById('login-msg').classList.remove('hidden');
        return;
    }
    
    const q = query(getColl('employees'), where('loginUser','==',u), where('loginPass','==',p));
    const snap = await getDocs(q);
    
    if(snap.empty) {
        document.getElementById('login-msg').innerText = "Credenciais inválidas";
        document.getElementById('login-msg').classList.remove('hidden');
        return;
    }
    
    currentEmployee = {id:snap.docs[0].id, ...snap.docs[0].data()};
    
    if(document.getElementById('k-keep').checked) {
        localStorage.setItem('employee_auth', JSON.stringify(currentEmployee));
    }
    
    showEmployeePanel();
}

function showEmployeePanel() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('header').classList.remove('hidden');
    document.getElementById('main-container').classList.remove('hidden');
    
    document.getElementById('header-name').innerText = currentEmployee.nomeCompleto;
    document.getElementById('header-role').innerText = currentEmployee.cargo || 'Colaborador';
    
    renderEmployeePanel();
}

// --- LOGOUT ---
window.logoutEmployee = () => {
    localStorage.removeItem('employee_auth');
    currentEmployee = null;
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('login-screen').classList.add('flex');
    document.getElementById('header').classList.add('hidden');
    document.getElementById('main-container').classList.add('hidden');
    document.getElementById('login-user').value = '';
    document.getElementById('login-pass').value = '';
    document.getElementById('login-msg').classList.add('hidden');
};

// --- EMPLOYEE PANEL ---
async function renderEmployeePanel() {
    const el = document.getElementById('app-content');
    el.innerHTML = '<div class="flex justify-center mt-20"><div class="loader"></div></div>';
    
    const snap = await getDocs(getColl('registros_ponto'));
    const allPoints = snap.docs.map(d => ({...d.data(), d:d.data().timestamp.toDate()}));
    const empPoints = allPoints.filter(p => p.userId === currentEmployee.id).sort((a,b) => b.d - a.d);
    
    el.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div class="bg-white p-6 rounded shadow border-l-4 border-blue-500">
                <h3 class="text-gray-500 text-sm font-bold uppercase">Total de Registros</h3>
                <p class="text-3xl font-bold text-slate-800 mt-2">${empPoints.length}</p>
            </div>
            <div class="bg-white p-6 rounded shadow border-l-4 border-green-500">
                <h3 class="text-gray-500 text-sm font-bold uppercase">Último Registro</h3>
                <p class="text-lg font-bold text-slate-800 mt-2">${empPoints.length > 0 ? empPoints[0].tipo : 'Nenhum'}</p>
                <p class="text-xs text-gray-500 mt-1">${empPoints.length > 0 ? empPoints[0].d.toLocaleString('pt-BR') : 'N/A'}</p>
            </div>
            <div class="bg-white p-6 rounded shadow border-l-4 border-purple-500">
                <h3 class="text-gray-500 text-sm font-bold uppercase">Jornada</h3>
                <p class="text-2xl font-bold text-slate-800 mt-2">${currentEmployee.jornadaHHMM || '08:00'}</p>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-white p-6 rounded shadow">
                <h3 class="font-bold text-lg mb-4 flex items-center gap-2"><i class="fa-solid fa-clock text-blue-600"></i> Bater Ponto</h3>
                <button onclick="registrarPonto()" class="w-full bg-blue-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-blue-700 transition transform active:scale-95 shadow-lg flex items-center justify-center gap-2">
                    <i class="fa-solid fa-hand-fist"></i> REGISTRAR PONTO
                </button>
                <p class="text-xs text-gray-500 mt-4 text-center">Clique para registrar sua entrada, saída ou retorno</p>
            </div>

            <div class="bg-white p-6 rounded shadow">
                <h3 class="font-bold text-lg mb-4 flex items-center gap-2"><i class="fa-solid fa-calendar-days text-green-600"></i> Hoje</h3>
                <div id="today-points" class="space-y-2">
                    <p class="text-gray-500 italic">Carregando...</p>
                </div>
            </div>
        </div>

        <div class="mt-8 bg-white p-6 rounded shadow">
            <div class="flex justify-between items-center mb-4 flex-wrap gap-4">
                <h3 class="font-bold text-lg flex items-center gap-2"><i class="fa-solid fa-history text-orange-600"></i> Histórico de Pontos</h3>
                <div class="flex gap-2 flex-wrap">
                    <select id="filter-month" onchange="filterHistorico()" class="border p-2 rounded text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                        <option value="">Todos os Meses</option>
                        ${getMonthOptions()}
                    </select>
                    <select id="filter-type" onchange="filterHistorico()" class="border p-2 rounded text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                        <option value="">Todos os Tipos</option>
                        <option>Entrada</option>
                        <option>Saída Almoço</option>
                        <option>Volta Almoço</option>
                        <option>Saída</option>
                    </select>
                </div>
            </div>

            <div class="overflow-x-auto">
                <table class="w-full text-sm text-left" id="history-table">
                    <thead class="bg-gray-100 uppercase border-b">
                        <tr>
                            <th class="p-3">Data</th>
                            <th class="p-3">Hora</th>
                            <th class="p-3">Tipo</th>
                            <th class="p-3">Status</th>
                        </tr>
                    </thead>
                    <tbody id="history-tbody">
                        ${renderHistoryTable(empPoints)}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="mt-8 bg-white p-6 rounded shadow">
            <h3 class="font-bold text-lg mb-4 flex items-center gap-2"><i class="fa-solid fa-chart-line text-purple-600"></i> Resumo Mensal</h3>
            <div id="monthly-summary" class="space-y-3">
                <p class="text-gray-500 italic">Carregando...</p>
            </div>
        </div>
    `;
    
    // Populate today's points
    const today = new Date().toISOString().split('T')[0];
    const todayPoints = empPoints.filter(p => p.d.toISOString().split('T')[0] === today);
    
    const todayHtml = todayPoints.length > 0 ? 
        todayPoints.map(p => `
            <div class="flex justify-between items-center p-2 bg-blue-50 rounded border-l-4 border-blue-400">
                <span class="font-medium">${p.tipo}</span>
                <span class="text-sm text-gray-600">${p.d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</span>
            </div>
        `).join('') :
        '<p class="text-gray-500 italic">Nenhum registro hoje</p>';
    
    document.getElementById('today-points').innerHTML = todayHtml;
    
    // Populate monthly summary
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthPoints = empPoints.filter(p => p.d.getMonth() === currentMonth && p.d.getFullYear() === currentYear);
    
    const daysWorked = new Set(monthPoints.map(p => p.d.toISOString().split('T')[0])).size;
    const totalPoints = monthPoints.length;
    
    const monthlySummaryHtml = `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="bg-blue-50 p-3 rounded border-l-4 border-blue-400">
                <p class="text-xs text-gray-600">Dias Trabalhados</p>
                <p class="text-2xl font-bold text-blue-600">${daysWorked}</p>
            </div>
            <div class="bg-green-50 p-3 rounded border-l-4 border-green-400">
                <p class="text-xs text-gray-600">Total de Registros</p>
                <p class="text-2xl font-bold text-green-600">${totalPoints}</p>
            </div>
            <div class="bg-purple-50 p-3 rounded border-l-4 border-purple-400">
                <p class="text-xs text-gray-600">Média por Dia</p>
                <p class="text-2xl font-bold text-purple-600">${daysWorked > 0 ? (totalPoints / daysWorked).toFixed(1) : '0'}</p>
            </div>
            <div class="bg-orange-50 p-3 rounded border-l-4 border-orange-400">
                <p class="text-xs text-gray-600">Mês Atual</p>
                <p class="text-2xl font-bold text-orange-600">${new Date().toLocaleDateString('pt-BR', {month: 'short', year: 'numeric'})}</p>
            </div>
        </div>
    `;
    
    document.getElementById('monthly-summary').innerHTML = monthlySummaryHtml;
}

function renderHistoryTable(points) {
    if(points.length === 0) return '<tr><td colspan="4" class="p-4 text-center text-gray-500">Nenhum registro</td></tr>';
    
    return points.slice(0, 50).map(p => `
        <tr class="border-b hover:bg-gray-50 transition">
            <td class="p-3">${p.d.toLocaleDateString('pt-BR')}</td>
            <td class="p-3 font-mono">${p.d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</td>
            <td class="p-3">
                <span class="px-2 py-1 rounded text-xs font-bold ${
                    p.tipo === 'Entrada' ? 'bg-green-100 text-green-700' :
                    p.tipo === 'Saída' ? 'bg-red-100 text-red-700' :
                    'bg-blue-100 text-blue-700'
                }">${p.tipo}</span>
            </td>
            <td class="p-3"><i class="fa-solid fa-check-circle text-green-600"></i></td>
        </tr>
    `).join('');
}

function getMonthOptions() {
    const months = [];
    for(let i = 0; i < 12; i++) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const value = date.toISOString().slice(0, 7);
        const label = date.toLocaleDateString('pt-BR', {month: 'long', year: 'numeric'});
        months.push(`<option value="${value}">${label}</option>`);
    }
    return months.join('');
}

window.filterHistorico = async () => {
    const snap = await getDocs(getColl('registros_ponto'));
    const allPoints = snap.docs.map(d => ({...d.data(), d:d.data().timestamp.toDate()}));
    const empPoints = allPoints.filter(p => p.userId === currentEmployee.id).sort((a,b) => b.d - a.d);
    
    const monthFilter = document.getElementById('filter-month').value;
    const typeFilter = document.getElementById('filter-type').value;
    
    let filtered = empPoints;
    
    if(monthFilter) {
        const [year, month] = monthFilter.split('-').map(Number);
        filtered = filtered.filter(p => p.d.getFullYear() === year && p.d.getMonth() === month - 1);
    }
    
    if(typeFilter) {
        filtered = filtered.filter(p => p.tipo === typeFilter);
    }
    
    document.getElementById('history-tbody').innerHTML = renderHistoryTable(filtered);
};

window.registrarPonto = async () => {
    const btn = event.target;
    btn.disabled = true;
    
    try {
        await addDoc(getColl('registros_ponto'), {
            userId: currentEmployee.id,
            tipo: 'Entrada', // Simplified - in production would determine based on last entry
            timestamp: serverTimestamp()
        });
        
        alert('Ponto registrado com sucesso!');
        renderEmployeePanel();
    } catch(err) {
        alert('Erro ao registrar ponto: ' + err.message);
        btn.disabled = false;
    }
};

// --- MODO PONTO (QUIOSQUE) ---
async function renderKiosk(el) {
    document.getElementById('header').classList.add('hidden');
    document.getElementById('main-container').classList.remove('hidden');
    document.getElementById('main-container').className = "w-full h-full bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4";
    
    const savedAuth = JSON.parse(localStorage.getItem('ponto_auth'));
    if(savedAuth) {
        return renderPointClock(el, savedAuth);
    }

    el.innerHTML = `
        <div class="bg-white p-8 rounded-lg shadow-2xl w-full max-w-sm text-center">
            ${company.logo ? `<img src="${company.logo}" class="h-20 mx-auto mb-4">` : ''}
            <h2 class="text-2xl font-bold mb-2 text-slate-800">Ponto Eletrônico</h2>
            <p class="text-gray-500 text-sm mb-6">Faça login para registrar</p>
            
            <form id="ponto-login" class="space-y-4">
                <div>
                    <input id="k-user" class="w-full border p-3 rounded bg-gray-50 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="Usuário" required>
                </div>
                <div>
                    <input id="k-pass" type="password" class="w-full border p-3 rounded bg-gray-50 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="Senha" required>
                </div>
                <label class="flex items-center gap-2 text-sm">
                    <input type="checkbox" id="k-keep" class="rounded">
                    <span>Manter conectado</span>
                </label>
                <button type="submit" class="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700 shadow-lg transition">ENTRAR</button>
            </form>
            <p id="ponto-msg" class="mt-4 text-center text-red-500 text-sm hidden"></p>
        </div>
    `;

    document.getElementById('ponto-login').onsubmit = async (e) => {
        e.preventDefault();
        const u = document.getElementById('k-user').value;
        const p = document.getElementById('k-pass').value;
        
        const q = query(getColl('employees'), where('loginUser','==',u), where('loginPass','==',p));
        const snap = await getDocs(q);
        
        if(snap.empty) {
            document.getElementById('ponto-msg').innerText = 'Dados incorretos';
            document.getElementById('ponto-msg').classList.remove('hidden');
            return;
        }
        
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
                <p class="opacity-80 text-sm">${emp.cargo || 'Colaborador'}</p>
            </div>
            <div class="p-8 text-center">
                <div id="clock" class="text-5xl font-mono font-bold text-slate-700 mb-2">--:--</div>
                <div id="date" class="text-gray-400 font-bold uppercase text-xs mb-8">--</div>
                
                <div id="last-reg" class="bg-gray-100 p-3 rounded text-sm mb-6 border-l-4 border-blue-400">
                    <p class="text-xs text-gray-600 mb-1">Último Registro</p>
                    <p class="font-bold" id="last-st">...</p>
                </div>

                <button id="btn-hit" class="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-xl font-bold text-xl transition transform active:scale-95">
                    REGISTRAR PONTO
                </button>
                
                <button onclick="logoutPonto()" class="mt-6 text-gray-400 text-sm hover:text-red-500 underline transition">Sair / Trocar Conta</button>
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

    (async () => {
        const snap = await getDocs(getColl('registros_ponto'));
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
            renderPointClock(el, emp);
        }
    })();
}

window.logoutPonto = () => {
    localStorage.removeItem('ponto_auth');
    renderKiosk(document.getElementById('app-content'));
}

// --- MODO AUTO CADASTRO ---
function renderAutoCadastro(el) {
    document.getElementById('header').classList.add('hidden');
    document.getElementById('main-container').classList.remove('hidden');
    document.getElementById('main-container').className = "w-full h-full bg-gray-100 overflow-y-auto p-4";
    
    el.innerHTML = `
        <div class="max-w-2xl mx-auto bg-white p-8 rounded shadow-xl my-10">
            <h2 class="text-2xl font-bold mb-4 text-center flex items-center justify-center gap-2">
                <i class="fa-solid fa-file-signature text-blue-600"></i> Ficha de Admissão Digital
            </h2>
            <p class="text-gray-500 text-sm text-center mb-8">Preencha seus dados corretamente. Sua senha de acesso será gerada automaticamente.</p>
            
            <form id="form-auto" class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-bold mb-1">Nome Completo *</label>
                        <input id="a-nome" class="w-full border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="Seu nome completo" required>
                    </div>
                    <div>
                        <label class="block text-sm font-bold mb-1">CPF *</label>
                        <input id="a-cpf" class="w-full border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="000.000.000-00" required>
                    </div>
                    <div>
                        <label class="block text-sm font-bold mb-1">RG *</label>
                        <input id="a-rg" class="w-full border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="Seu RG" required>
                    </div>
                    <div>
                        <label class="block text-sm font-bold mb-1">Data de Nascimento *</label>
                        <input id="a-nasc" type="date" class="w-full border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" required>
                    </div>
                    <div>
                        <label class="block text-sm font-bold mb-1">PIS/NIS</label>
                        <input id="a-pis" class="w-full border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="Seu PIS ou NIS">
                    </div>
                    <div>
                        <label class="block text-sm font-bold mb-1">Estado *</label>
                        <select id="a-uf" class="w-full border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" required>
                            <option value="">Selecione seu Estado</option>
                            <option>SP</option><option>RJ</option><option>MG</option><option>BA</option><option>RS</option>
                            <option>PR</option><option>SC</option><option>GO</option><option>DF</option><option>ES</option>
                            <option>PE</option><option>CE</option><option>PA</option><option>MA</option><option>PB</option>
                            <option>RN</option><option>AL</option><option>MT</option><option>MS</option><option>RO</option>
                            <option>AC</option><option>AM</option><option>AP</option><option>RR</option><option>TO</option>
                        </select>
                    </div>
                    <div class="md:col-span-2">
                        <label class="block text-sm font-bold mb-1">Endereço Completo *</label>
                        <input id="a-end" class="w-full border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="Rua, número, bairro" required>
                    </div>
                    <div>
                        <label class="block text-sm font-bold mb-1">Município *</label>
                        <input id="a-mun" class="w-full border p-2 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" placeholder="Seu município" required>
                    </div>
                </div>
                <button type="submit" class="w-full bg-green-600 text-white py-3 rounded font-bold hover:bg-green-700 transition flex items-center justify-center gap-2">
                    <i class="fa-solid fa-check-circle"></i> ENVIAR CADASTRO
                </button>
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
            cargo: 'Novo (Aguardando)',
            jornadaHHMM: '08:00'
        };
        
        await addDoc(getColl('employees'), data);
        el.innerHTML = `
            <div class="max-w-md mx-auto bg-white p-8 rounded shadow text-center mt-20">
                <i class="fa-solid fa-check-circle text-5xl text-green-500 mb-4"></i>
                <h2 class="text-2xl font-bold">Cadastro Realizado!</h2>
                <p class="text-gray-600 mt-4">Anote suas credenciais provisórias:</p>
                <div class="bg-gray-100 p-4 rounded mt-4 font-mono text-lg border border-dashed border-gray-400">
                    <p>Usuário: <b>${genUser}</b></p>
                    <p>Senha: <b>${genPass}</b></p>
                </div>
                <p class="text-xs text-gray-400 mt-6">Informe ao seu gestor para liberação.</p>
            </div>
        `;
    }
}

init();

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, addDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
const getColl = (name) => collection(db, `${appId}-${name}`);

// VARIAVEIS GLOBAIS
let GLOBAL_USER_DATA = {};
let GLOBAL_ROLE = 'admin'; // 'admin' ou 'employee'
const SALT = "a6b9c8d7e5f4g3h2i1j0k9l8m7n6o5p4"; // SALT de segurança (DEVE SER MANTIDO EM SEGREDO EM AMBIENTES REAIS)

// UTILS
const getEl = (id) => document.getElementById(id);
const getHash = (pass) => sha256.hmac(SALT, pass); // Usa sha256 (simulação de hashing)

const formatTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const calcDailyHours = (registros) => {
    // Implementação de lógica para calcular o total de horas trabalhadas no dia.
    // Retorna { minutes: number, batidas: [string] }
    // ... Lógica omitida para brevidade, mas deve calcular a diferença entre as batidas.
    // Exemplo: Batidas [08:00, 12:00, 13:00, 17:00] -> 4h + 4h = 8h.
    return { minutes: 480, batidas: ['08:00', '12:00', '13:00', '17:00'] }; 
};

// --- AUTENTICAÇÃO E ROTEAMENTO ---

const toggleLoginRole = () => {
    const roleInput = getEl('login-role');
    const title = getEl('login-title');
    const btn = getEl('login-btn');
    const toggleBtn = getEl('login-screen').querySelector('button[onclick="toggleLoginRole()"]');

    if (roleInput.value === 'admin') {
        roleInput.value = 'employee';
        title.textContent = 'Acesso Colaborador / Ponto';
        btn.textContent = 'Acessar Ponto';
        toggleBtn.textContent = 'Acessar como Gestor';
    } else {
        roleInput.value = 'admin';
        title.textContent = 'Acesso Gestor';
        btn.textContent = 'Entrar';
        toggleBtn.textContent = 'Acessar como Colaborador/Ponto';
    }
}

const loginUser = async () => {
    const user = getEl('login-user').value;
    const pass = getEl('login-pass').value;
    const role = getEl('login-role').value;
    const messageEl = getEl('login-message');
    
    messageEl.textContent = 'Verificando credenciais...';

    // 1. Geração do HASH
    const hashedPass = getHash(pass);

    let collName = role === 'admin' ? 'admins' : 'employees';
    
    // 2. Consulta de Segurança (Busca por loginUser e hashedPass)
    try {
        const q = query(getColl(collName), where('loginUser', '==', user));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            messageEl.textContent = 'Usuário ou senha inválidos.';
            return;
        }

        const userData = snapshot.docs[0].data();
        
        // NOVO: Validação da senha com o hash armazenado
        if (userData.loginPass === hashedPass) {
            // Sucesso!
            GLOBAL_USER_DATA = { id: snapshot.docs[0].id, ...userData };
            GLOBAL_ROLE = role;
            getEl('user-role-display').textContent = role === 'admin' ? 'Gestor' : 'Colaborador';
            getEl('login-screen').classList.add('hidden');
            router(role === 'admin' ? 'dashboard' : 'employee-history');
        } else {
            messageEl.textContent = 'Usuário ou senha inválidos.';
        }

    } catch (error) {
        console.error("Erro no login:", error);
        messageEl.textContent = 'Ocorreu um erro ao tentar logar.';
    }
};

const checkAuth = async () => {
    getEl('login-screen').classList.remove('hidden');

    // Tenta autenticar anonimamente
    try {
        await signInAnonymously(auth);
    } catch (e) {
        console.error("Erro na autenticação anônima:", e);
    }

    // O código anterior forçava o login do admin se estivesse vazio.
    // Agora, o sistema apenas exibe a tela de login.
    // Se precisar forçar o ADMIN, execute loginUser() com as credenciais padrões.
};

const router = (route) => {
    // Lógica para esconder/mostrar o sidebar e mudar o conteúdo principal.
    getEl('sidebar').classList.add('hidden', 'absolute'); // Esconde o menu em mobile
    
    // Ajuste de permissões
    if (GLOBAL_ROLE === 'employee' && route !== 'employee-history') {
        alert("Acesso negado. Colaboradores só podem ver seu histórico.");
        route = 'employee-history';
    } else if (GLOBAL_ROLE === 'admin' && route === 'employee-history') {
        route = 'dashboard';
    }

    // Limpar o conteúdo
    getEl('app-content').innerHTML = '<div class="flex justify-center mt-20"><div class="loader"></div></div>';
    
    // Roteamento
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    if (route === 'dashboard') {
        getEl('nav-dashboard').classList.add('active');
        renderDashboard();
    } else if (route === 'rh') {
        getEl('nav-rh').classList.add('active');
        renderRH();
    } else if (route === 'reports') {
        getEl('nav-reports').classList.add('active');
        renderReports();
    } else if (route === 'config') {
        getEl('nav-config').classList.add('active');
        renderConfig();
    } else if (route === 'links') {
        getEl('nav-links').classList.add('active');
        renderLinks();
    } else if (route === 'employee-history') {
        // NOVO: Rota para Colaborador (Histórico)
        renderEmployeeHistory();
    }
}

// --- RENDERING VIEWS ---

// NOVO: View para o Histórico Pessoal do Colaborador
const renderEmployeeHistory = async () => {
    const employee = GLOBAL_USER_DATA;
    getEl('app-content').innerHTML = `
        <h2 class="text-3xl font-bold mb-6 text-slate-700">Meu Histórico de Ponto</h2>
        <p class="text-lg mb-4">Olá, **${employee.nomeCompleto}**.</p>
        <div class="bg-white shadow-lg rounded-lg p-6">
            <h3 class="text-xl font-semibold mb-4">Pontos do Mês Atual</h3>
            <div id="history-table-container" class="table-responsive-employee">
                <p>Carregando histórico...</p>
            </div>
        </div>
    `;

    try {
        // Consulta: Registros de ponto do colaborador logado
        const q = query(getColl('registros_ponto'), where('userId', '==', employee.id), orderBy('timestamp', 'desc'));
        const snapshot = await getDocs(q);
        
        const monthlyData = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            const date = new Date(data.timestamp.toDate()).toLocaleDateString('pt-BR');
            
            if (!monthlyData[date]) {
                monthlyData[date] = [];
            }
            monthlyData[date].push(new Date(data.timestamp.toDate()).toLocaleTimeString('pt-BR'));
        });

        let tableHTML = `<table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Batidas (Horário)</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Horas Trabalhadas</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
        `;
        
        for (const date in monthlyData) {
            const batidas = monthlyData[date].sort();
            const { minutes } = calcDailyHours(batidas); // Reutiliza a função de cálculo
            
            tableHTML += `
                <tr>
                    <td class="px-6 py-4 whitespace-nowrap">${date}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${batidas.join(' - ')}</td>
                    <td class="px-6 py-4 whitespace-nowrap">${formatTime(minutes)}</td>
                </tr>
            `;
        }
        
        tableHTML += `</tbody></table>`;
        getEl('history-table-container').innerHTML = tableHTML;
        
    } catch (e) {
        console.error("Erro ao carregar histórico:", e);
        getEl('history-table-container').innerHTML = `<p class="text-red-500">Não foi possível carregar o histórico. Tente novamente.</p>`;
    }
}

// NOVO: Dashboard do Gestor (Métricas)
const renderDashboard = async () => {
    getEl('app-content').innerHTML = `
        <h2 class="text-3xl font-bold mb-6 text-slate-700">Dashboard de Gestão</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6" id="dashboard-stats">
            </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div id="aniversariantes-card" class="bg-white shadow-lg rounded-lg p-6">
                <h3 class="text-xl font-semibold mb-4 text-blue-600"><i class="fa-solid fa-gift mr-2"></i> Aniversariantes do Mês</h3>
                <ul id="aniversariantes-list" class="space-y-2"><li>Carregando...</li></ul>
            </div>
            <div id="banco-horas-card" class="bg-white shadow-lg rounded-lg p-6">
                <h3 class="text-xl font-semibold mb-4 text-orange-600"><i class="fa-solid fa-clock mr-2"></i> Saldo de Banco de Horas (Crítico)</h3>
                <p class="text-sm text-gray-500 mb-3">Colaboradores com maior saldo devedor ou credor.</p>
                <ul id="banco-horas-list" class="space-y-2"><li>Carregando...</li></ul>
            </div>
            <div id="ferias-card" class="bg-white shadow-lg rounded-lg p-6 col-span-full">
                <h3 class="text-xl font-semibold mb-4 text-green-600"><i class="fa-solid fa-plane-departure mr-2"></i> Férias Programadas (Próximos 3 meses)</h3>
                <ul id="ferias-list" class="space-y-2"><li>Carregando...</li></ul>
            </div>
        </div>
    `;
    
    const today = new Date();
    const currentMonth = today.getMonth() + 1; // Mês atual (1-12)
    const nextThreeMonths = [(today.getMonth() + 1) % 12 + 1, (today.getMonth() + 2) % 12 + 1, (today.getMonth() + 3) % 12 + 1];

    try {
        const q = query(getColl('employees'));
        const snapshot = await getDocs(q);
        const employees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 1. Aniversariantes
        const aniversariantes = employees.filter(emp => {
            if (!emp.dataNascimento) return false;
            const month = parseInt(emp.dataNascimento.split('-')[1]);
            return month === currentMonth;
        });
        
        getEl('aniversariantes-list').innerHTML = aniversariantes.length > 0
            ? aniversariantes.map(emp => `<li><i class="fa-solid fa-cake-candles text-pink-500"></i> ${emp.nomeCompleto} (${emp.dataNascimento.split('-')[2]}/${emp.dataNascimento.split('-')[1]})</li>`).join('')
            : '<li>Nenhum aniversariante neste mês.</li>';

        // 2. Férias (Simulação - assumindo campo 'feriasInicio' e 'feriasFim' em 'employees')
        const ferias = employees.filter(emp => {
            if (!emp.feriasInicio) return false;
            const feriasMonth = new Date(emp.feriasInicio).getMonth() + 1;
            return nextThreeMonths.includes(feriasMonth);
        });

        getEl('ferias-list').innerHTML = ferias.length > 0
            ? ferias.map(emp => `<li><i class="fa-solid fa-calendar-alt text-teal-500"></i> ${emp.nomeCompleto}: ${new Date(emp.feriasInicio).toLocaleDateString()} a ${new Date(emp.feriasFim).toLocaleDateString()}</li>`).join('')
            : '<li>Nenhum colaborador com férias agendadas nos próximos 3 meses.</li>';

        // 3. Banco de Horas (Simulação - requer dados de ponto e lógica de saldo)
        // Para uma implementação completa, seria necessário consultar 'registros_ponto' para cada funcionário.
        getEl('banco-horas-list').innerHTML = `
            <li><i class="fa-solid fa-arrow-down text-red-500"></i> **João da Silva**: -15:30h (Ajustar até o dia 30/11)</li>
            <li><i class="fa-solid fa-arrow-up text-green-500"></i> **Maria Souza**: +20:00h (Ajustar até o dia 30/11)</li>
        `;
        
    } catch (e) {
        console.error("Erro ao carregar Dashboard:", e);
        getEl('app-content').innerHTML += `<p class="text-red-500">Erro ao carregar dados do dashboard.</p>`;
    }
};

// ... (Outras funções de renderização como renderConfig, renderLinks, openModal, etc., são omitidas por serem muito longas e menos modificadas) ...

// RENDER RH (Gestão de Colaboradores)
const renderRH = async () => {
    // ... HTML para a tela RH (busca e cadastro) ...
    getEl('app-content').innerHTML = `
        <h2 class="text-3xl font-bold mb-6 text-slate-700">Gestão de Colaboradores</h2>
        <div class="bg-white shadow-lg rounded-lg p-6 mb-6">
            <h3 class="text-xl font-semibold mb-4">Filtros de Busca</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <select id="filter-estado" class="block w-full px-3 py-2 border border-gray-300 rounded-md">
                    <option value="">Filtrar por Estado</option>
                </select>
                <select id="filter-cargo" class="block w-full px-3 py-2 border border-gray-300 rounded-md">
                    <option value="">Filtrar por Cargo</option>
                </select>
                <button onclick="applyRHFilters()" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md"><i class="fa-solid fa-filter"></i> Aplicar Filtros</button>
            </div>
        </div>
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-semibold">Lista de Colaboradores</h3>
            <button onclick="openEmpModal(null)" class="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-md"><i class="fa-solid fa-plus"></i> Novo Cadastro</button>
        </div>
        <div id="rh-list-container" class="bg-white shadow-lg rounded-lg p-6">
            <p>Carregando colaboradores...</p>
        </div>
    `;

    // Carrega dados de estrutura para filtros
    // ...

    listRH();
};

const applyRHFilters = () => {
    // Função de filtro simples. Requer lógica mais complexa para consulta ao Firestore (query, where)
    listRH(getEl('filter-estado').value, getEl('filter-cargo').value);
}

const listRH = async (estado = '', cargo = '') => {
    const container = getEl('rh-list-container');
    container.innerHTML = '<div class="flex justify-center"><div class="loader"></div></div>';

    try {
        let q;
        let queryArgs = [];

        if (estado) queryArgs.push(where('estado', '==', estado));
        if (cargo) queryArgs.push(where('cargo', '==', cargo));
        
        // NOVO: Ordena por nome completo
        queryArgs.push(orderBy('nomeCompleto', 'asc'));

        q = query(getColl('employees'), ...queryArgs);
        
        const snapshot = await getDocs(q);
        
        // ... (Renderização da tabela de colaboradores) ...
        let tableHTML = `<div class="overflow-x-auto"><table class="min-w-full divide-y divide-gray-200">
            <tbody class="bg-white divide-y divide-gray-200">`;

        snapshot.forEach(doc => {
            const emp = doc.data();
            // ... (linhas da tabela) ...
        });
        
        tableHTML += `</tbody></table></div>`;
        container.innerHTML = tableHTML;

    } catch (e) {
        console.error("Erro ao listar RH:", e);
        container.innerHTML = `<p class="text-red-500">Erro ao carregar lista de colaboradores.</p>`;
    }
}

const openEmpModal = async (id) => {
    let empData = {};
    if (id) {
        // Carrega dados para edição
        // ...
    }
    
    const modalContent = getEl('modal-content');
    modalContent.innerHTML = `
        <form id="form-emp" onsubmit="event.preventDefault(); saveEmployee('${id || ''}')" class="p-6">
            <h3 class="text-2xl font-bold mb-4">${id ? 'Editar Colaborador' : 'Novo Colaborador'}</h3>
            <div class="mb-4">
                <label for="a-admissao" class="block text-sm font-medium text-gray-700">Data de Admissão</label>
                <input type="date" id="a-admissao" required class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md">
            </div>

            <div class="mb-6 border p-4 rounded-md">
                <h4 class="text-lg font-semibold mb-3">Critérios de Ponto</h4>
                <div class="mb-3">
                    <label class="block text-sm font-medium text-gray-700">Batidas Padrão:</label>
                    <select id="a-batidas-padrao" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md">
                        <option value="2">2 Batidas (Início / Fim Jornada)</option>
                        <option value="4">4 Batidas (Início / Pausa / Retorno / Fim)</option>
                    </select>
                </div>
                <div class="flex items-center">
                    <input id="a-selfie-obrigatoria" type="checkbox" class="h-4 w-4 text-blue-600 border-gray-300 rounded">
                    <label for="a-selfie-obrigatoria" class="ml-2 block text-sm font-medium text-gray-700">Selfie Obrigatória na Batida</label>
                </div>
            </div>

            <div class="flex justify-end gap-2">
                <button type="button" onclick="closeModal()" class="px-4 py-2 bg-gray-300 text-gray-800 rounded-md">Cancelar</button>
                <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-md">Salvar</button>
            </div>
        </form>
    `;
    // ... (Lógica de preenchimento de campos) ...
    openModal();
}

const saveEmployee = async (id) => {
    const el = getEl('form-emp');
    
    // NOVO: Adiciona a Data de Admissão e Critérios de Ponto
    const data = {
        // ... Campos existentes (nomeCompleto, cpf, etc.)
        dataAdmissao: getEl('a-admissao').value,
        batidasPadrao: getEl('a-batidas-padrao').value,
        selfieObrigatoria: getEl('a-selfie-obrigatoria').checked,
        // ...
        jornadaHHMM: '08:00'
    };

    if (!id) {
        // NOVO: Geração de credenciais com HASH
        const genUser = 'user' + Math.random().toString(36).substring(2, 8);
        const genPass = Math.random().toString(36).substring(2, 6).slice(-6);
        data.loginUser = genUser;
        data.loginPass = getHash(genPass); // **Importante: Hashing da senha!**

        await addDoc(getColl('employees'), data);
        
        // Exibir credenciais (aqui, o sistema precisa exibir a senha *sem hash* para o gestor anotar)
        el.innerHTML = `
            <div class="max-w-md mx-auto bg-white p-8 rounded shadow text-center mt-20">
                <i class="fa-solid fa-check-circle text-5xl text-green-500 mb-4"></i>
                <h2 class="text-2xl font-bold">Cadastro Realizado!</h2>
                <p class="text-gray-600 mt-2">Anote as credenciais provisórias (faça a batida do ponto para forçar o colaborador a usar o login):</p>
                <div class="bg-gray-100 p-4 rounded mt-4 font-mono text-lg border border-dashed border-gray-400">
                    <p>Usuário: <b>${genUser}</b></p>
                    <p>Senha: <b>${genPass}</b></p>
                </div>
                <button onclick="closeModal(); router('rh');" class="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md">Ok, Entendi</button>
            </div>`;
    } else {
        await updateDoc(doc(getColl('employees'), id), data);
        closeModal();
        router('rh');
    }
}

// RENDER REPORTS (Relatórios & Ponto)
const renderReports = async () => {
    // ... (HTML para a tela de relatórios, incluindo seleção de mês e ano)
    getEl('app-content').innerHTML = `
        <h2 class="text-3xl font-bold mb-6 text-slate-700">Relatórios & Ponto</h2>
        <div class="bg-white shadow-lg rounded-lg p-6 mb-6">
            <h3 class="text-xl font-semibold mb-4">Seleção de Colaboradores e Período</h3>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <select id="report-filter-estado" class="block w-full px-3 py-2 border border-gray-300 rounded-md">
                    <option value="">Filtrar por Estado</option>
                </select>
                <select id="report-filter-cargo" class="block w-full px-3 py-2 border border-gray-300 rounded-md">
                    <option value="">Filtrar por Cargo</option>
                </select>
                <select id="report-month" class="block w-full px-3 py-2 border border-gray-300 rounded-md">
                    </select>
                <select id="report-year" class="block w-full px-3 py-2 border border-gray-300 rounded-md">
                    </select>
            </div>
            
            <button onclick="applyReportFilters()" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md mb-4"><i class="fa-solid fa-filter"></i> Filtrar Colaboradores</button>

            <div id="collaborator-selection" class="border p-4 rounded-md max-h-60 overflow-y-auto">
                <div class="flex items-center mb-3">
                    <input type="checkbox" id="select-all-employees" onclick="toggleSelectAllReports()" class="h-4 w-4 text-blue-600 border-gray-300 rounded">
                    <label for="select-all-employees" class="ml-2 block text-sm font-medium text-gray-700 font-bold">Selecionar Todos</label>
                </div>
                <div id="report-employee-list">
                    <p>Filtre os colaboradores acima.</p>
                </div>
            </div>
            
            <button onclick="genReport(null, true)" id="btn-gen-batch" class="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-md" disabled><i class="fa-solid fa-file-export mr-2"></i> Gerar Relatórios em Lote</button>
        </div>
        
        <div id="report-viewer" class="mt-6">
            </div>
    `;
    // Preencher filtros e lista inicial
    // ...
}

const applyReportFilters = async () => {
    const estado = getEl('report-filter-estado').value;
    const cargo = getEl('report-filter-cargo').value;
    const listContainer = getEl('report-employee-list');
    listContainer.innerHTML = '<p>Carregando...</p>';
    getEl('btn-gen-batch').disabled = true;

    try {
        let q = query(getColl('employees'), orderBy('nomeCompleto', 'asc'));
        
        // Aplica filtros se existirem
        let queryArgs = [];
        if (estado) queryArgs.push(where('estado', '==', estado));
        if (cargo) queryArgs.push(where('cargo', '==', cargo));
        
        q = query(getColl('employees'), ...queryArgs, orderBy('nomeCompleto', 'asc'));

        const snapshot = await getDocs(q);
        
        listContainer.innerHTML = snapshot.docs.map(doc => {
            const emp = doc.data();
            return `
                <div class="flex items-center py-1">
                    <input type="checkbox" id="emp-check-${doc.id}" name="report-employee" value="${doc.id}" class="h-4 w-4 text-blue-600 border-gray-300 rounded">
                    <label for="emp-check-${doc.id}" class="ml-2 block text-sm text-gray-700">${emp.nomeCompleto} (${emp.cargo})</label>
                </div>
            `;
        }).join('');
        
        getEl('btn-gen-batch').disabled = false;
        
    } catch (e) {
        console.error("Erro ao aplicar filtro de relatórios:", e);
        listContainer.innerHTML = `<p class="text-red-500">Erro ao carregar lista de colaboradores.</p>`;
    }
}

const toggleSelectAllReports = () => {
    const isChecked = getEl('select-all-employees').checked;
    document.querySelectorAll('#report-employee-list input[type="checkbox"]').forEach(cb => {
        cb.checked = isChecked;
    });
}

const genReport = async (employeeId, isBatch = false) => {
    const month = getEl('report-month').value;
    const year = getEl('report-year').value;
    const viewer = getEl('report-viewer');
    
    // Lote
    if (isBatch) {
        const selectedIds = Array.from(document.querySelectorAll('input[name="report-employee"]:checked')).map(cb => cb.value);
        if (selectedIds.length === 0) {
            alert('Selecione pelo menos um colaborador para gerar o relatório em lote.');
            return;
        }
        
        viewer.innerHTML = ''; // Limpa antes de gerar o lote
        
        for (const id of selectedIds) {
            await generateSingleReport(id, month, year, viewer);
        }
    } else {
        // Individual
        viewer.innerHTML = '<div class="flex justify-center mt-20"><div class="loader"></div></div>';
        await generateSingleReport(employeeId, month, year, viewer);
    }
}

const generateSingleReport = async (employeeId, month, year, viewer) => {
    // Carrega dados do colaborador e registros de ponto
    const empDoc = await getDoc(doc(getColl('employees'), employeeId));
    const employee = { id: empDoc.id, ...empDoc.data() };
    
    // Consulta os registros de ponto para o mês/ano
    // ...

    // NOVO: Cálculo dos totais
    const jornadaMensalMin = 220 * 60; // Exemplo: 220h mensais * 60 min
    const totalTrabalhadoMin = 180 * 60; // Exemplo: 180h trabalhadas (simulado)
    const saldoMin = totalTrabalhadoMin - jornadaMensalMin;

    const horasFaltantes = saldoMin < 0 ? formatTime(Math.abs(saldoMin)) : '00:00';
    const horasSobrando = saldoMin > 0 ? formatTime(saldoMin) : '00:00';
    
    // Renderização do relatório
    const reportHTML = `
        <div class="report-paper bg-white p-8 mb-8 shadow-xl print-only">
            <div class="report-data-print mt-4 border-t pt-2">
                <h4 class="font-bold text-lg mb-2">Resumo Mensal de Horas</h4>
                <p><strong>Horas a serem Trabalhadas (Mês):</strong> ${formatTime(jornadaMensalMin)}</p>
                <p><strong>Horas Trabalhadas (Acumulado):</strong> ${formatTime(totalTrabalhadoMin)}</p>
                <p class="text-red-600"><strong>Total de Horas Faltantes:</strong> ${horasFaltantes}</p>
                <p class="text-green-600"><strong>Total de Horas Sobrando:</strong> ${horasSobrando}</p>
            </div>
            
            <div class="signature-lines">
                <div class="signature-line-box">
                    <span>Assinatura do Colaborador</span>
                </div>
                <div class="signature-line-box">
                    <span>Assinatura do Gestor / RH</span>
                </div>
            </div>
        </div>
        <div class="no-print text-center mb-4">
            <button onclick="window.print()" class="bg-blue-600 text-white p-3 rounded-lg"><i class="fa-solid fa-print"></i> Imprimir</button>
        </div>
    `;
    
    // Adiciona ao visualizador (se for em lote, adiciona um após o outro)
    if (viewer.innerHTML.includes('loader')) {
        viewer.innerHTML = '';
    }
    viewer.insertAdjacentHTML('beforeend', reportHTML);
}

// Inicialização
onAuthStateChanged(auth, (user) => {
    if (user) {
        checkAuth(); // Continua para a tela de login real
    }
});

// NOVO: Chamada de inicialização
checkAuth();

// Expor funções globais para HTML
window.router = router;
window.loginUser = loginUser;
window.toggleLoginRole = toggleLoginRole;
window.openEmpModal = openEmpModal;
window.saveEmployee = saveEmployee;
window.applyRHFilters = applyRHFilters;
window.renderDashboard = renderDashboard;
window.renderRH = renderRH;
window.renderReports = renderReports;
window.applyReportFilters = applyReportFilters;
window.toggleSelectAllReports = toggleSelectAllReports;
window.genReport = genReport;
window.generateSingleReport = generateSingleReport; // Expõe para ser chamada em lote (genReport)
window.closeModal = () => getEl('modal-overlay').classList.add('hidden');
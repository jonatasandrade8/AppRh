import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, addDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// --- CONFIGURAÇÃO E INICIALIZAÇÃO OBRIGATÓRIAS DO FIREBASE ---

// Usa a configuração injetada pelo ambiente
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
// Usa o ID da aplicação injetado pelo ambiente
const appId = typeof __app_id !== 'undefined' ? __app_id : 'rh-enterprise-v3';
// Token de autenticação customizado
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

if (Object.keys(firebaseConfig).length === 0) {
    console.error("Erro: firebaseConfig não foi carregado. Verifique a variável global __firebase_config.");
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Variáveis de estado global
let isAuthReady = false;
let isGuest = false;
let isAuth = false;
let isAdmin = false; // Controle de acesso Admin
let currentUserId = 'anonymous';
let currentEmployeeData = null; // Dados do colaborador logado

// Função de utilidade para obter a referência da coleção com as regras de segurança do Canvas.
const getColl = (collName, userId = currentUserId) => {
    // Coleções consideradas Públicas/Compartilhadas para o sistema de RH (Configurações, Empregados, Pontos)
    // Local: /artifacts/{appId}/public/data/{collName}
    if (['config', 'cargos', 'estados', 'redes', 'lojas', 'feriados', 'employees', 'points', 'admins'].includes(collName)) {
        return collection(db, `artifacts/${appId}/public/data/${collName}`);
    }
    // Coleções Privadas (apenas se houver dados estritamente privados do usuário)
    // Local: /artifacts/{appId}/users/{userId}/{collName}
    return collection(db, `artifacts/${appId}/public/data/${collName}`); // Mantendo tudo como público/compartilhado por padrão do sistema de RH
};

// Função para iniciar a autenticação (Custom Token ou Anônima)
async function initializeAuth() {
    try {
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
            console.log("Autenticação realizada com token customizado.");
        } else {
            await signInAnonymously(auth);
            console.log("Autenticação realizada anonimamente.");
        }
    } catch (error) {
        console.error("Erro na Inicialização da Autenticação:", error);
    }
}

// Observador de estado de autenticação
onAuthStateChanged(auth, async (user) => {
    isAuthReady = true;
    if (user) {
        currentUserId = user.uid;
        isAuth = true;
        
        // Verifica se é o admin padrão (para o primeiro acesso)
        if (currentUserId === 'admin') {
            isAdmin = true;
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('sidebar').classList.remove('hidden');
            await loadConfigAndRouter();
            return;
        }

        // Tenta carregar os dados do colaborador (employee)
        const employeesRef = getColl('employees');
        const q = query(employeesRef, where('loginUser', '==', user.email || user.uid));
        const employeeSnapshot = await getDocs(q);

        if (!employeeSnapshot.empty) {
            const employeeDoc = employeeSnapshot.docs[0];
            currentEmployeeData = { id: employeeDoc.id, ...employeeDoc.data() };
            isAdmin = false; // Não é admin
            
            // Verifica se tem permissão de Admin (caso o loginUser seja admin@admin.com, etc)
            const adminDoc = await getDoc(doc(getColl('admins'), 'admin-user'));
            const adminData = adminDoc.exists() ? adminDoc.data() : {};
            if (currentEmployeeData.loginUser === adminData.user && currentEmployeeData.loginPass === adminData.pass) {
                isAdmin = true;
            }

            document.getElementById('login-screen').classList.add('hidden');
            if (isAdmin) {
                document.getElementById('sidebar').classList.remove('hidden');
            } else {
                document.getElementById('sidebar').classList.add('hidden');
            }

            // Exibe o nome do colaborador na interface
            document.getElementById('user-name-display').textContent = isAdmin ? 'Admin' : currentEmployeeData.nomeCompleto;
            await loadConfigAndRouter();

        } else {
            // Logged in via Custom Token, but not an Admin or Employee
            isAuth = false;
            isAdmin = false;
            currentEmployeeData = null;
            document.getElementById('login-screen').classList.remove('hidden');
            document.getElementById('sidebar').classList.add('hidden');
            router('login');
        }

    } else {
        // Usuário deslogado (anônimo ou após signOut)
        isAuth = false;
        isAdmin = false;
        currentEmployeeData = null;
        document.getElementById('sidebar').classList.add('hidden');
        // Se a rota for pública, continua; senão, mostra login
        const currentRoute = window.location.hash.substring(1);
        if (['ponto', 'autocadastro'].includes(currentRoute)) {
            await loadConfigAndRouter();
        } else {
            router('login');
        }
    }
});

// Inicia o processo de autenticação
initializeAuth();

// --- FUNÇÕES DE UTILIDADE E CONFIGURAÇÃO ---

// Variáveis de cache para configurações
let configData = {};
let cargos = [];
let estados = [];
let feriados = [];
let redes = [];
let lojas = [];

// Carrega todas as configurações e as monitora em tempo real
async function loadConfigAndRouter() {
    // Prepara a interface se não for uma rota pública
    if (!['ponto', 'autocadastro'].includes(window.location.hash.substring(1))) {
        document.getElementById('app-content').innerHTML = '<div class="flex justify-center mt-20"><div class="loader"></div></div>';
    }
    
    // Configurações Globais (Logo, Nome da Empresa)
    onSnapshot(doc(getColl('config'), 'global'), (docSnapshot) => {
        if (docSnapshot.exists()) {
            configData = docSnapshot.data();
            document.getElementById('logo-display').src = configData.logo || 'https://placehold.co/150x50/334155/ffffff?text=RH';
            document.getElementById('company-name-display').textContent = configData.companyName || 'RH Enterprise';
            console.log("Configurações globais carregadas.");
        }
    });

    // Cadastro de Cargos
    onSnapshot(getColl('cargos'), (snapshot) => {
        cargos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Atualiza a view se necessário
        if (window.location.hash.substring(1) === 'config') renderConfigPage();
    });

    // Cadastro de Estados
    onSnapshot(getColl('estados'), (snapshot) => {
        estados = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (window.location.hash.substring(1) === 'config') renderConfigPage();
    });

    // Cadastro de Redes
    onSnapshot(getColl('redes'), (snapshot) => {
        redes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (window.location.hash.substring(1) === 'config') renderConfigPage();
    });

    // Cadastro de Lojas
    onSnapshot(getColl('lojas'), (snapshot) => {
        lojas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (window.location.hash.substring(1) === 'config') renderConfigPage();
    });

    // Cadastro de Feriados
    onSnapshot(getColl('feriados'), (snapshot) => {
        feriados = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (window.location.hash.substring(1) === 'feriados') renderHolidaysPage();
    });

    // Após carregar inicial, chama o roteador
    router(window.location.hash.substring(1) || 'dashboard');
}


// --- ROTEAMENTO E RENDERIZAÇÃO DE PÁGINAS ---

const router = (route) => {
    const contentEl = document.getElementById('app-content');
    contentEl.innerHTML = '<div class="flex justify-center mt-20"><div class="loader"></div></div>'; // Loading

    if (route === 'login') {
        renderLoginPage();
        document.getElementById('login-screen').classList.remove('hidden');
        return;
    }

    // Rotas públicas (Ponto, Autocadastro)
    if (route === 'ponto' || route === 'autocadastro') {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('sidebar').classList.add('hidden');
        if (route === 'ponto') return renderPointPage();
        if (route === 'autocadastro') return renderAutoRegisterPage();
    }
    
    // Rotas de Admin (Requer isAdmin)
    if (!isAdmin) {
        // Se a rota não é pública e o usuário não é admin, força o login
        document.getElementById('login-screen').classList.remove('hidden');
        router('login');
        return;
    }

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('sidebar').classList.remove('hidden');
    
    switch (route) {
        case 'dashboard':
            renderDashboard();
            break;
        case 'employees':
            renderEmployeesPage();
            break;
        case 'reports':
            renderReportsPage();
            break;
        case 'config':
            renderConfigPage();
            break;
        case 'feriados':
            renderHolidaysPage();
            break;
        case 'links':
            renderLinksPage();
            break;
        default:
            renderDashboard();
    }
    window.location.hash = route;
};

// Adiciona o listener para mudanças na hash
window.addEventListener('hashchange', () => {
    if (isAuthReady) {
        router(window.location.hash.substring(1));
    }
});


// --- FUNÇÕES DE RENDERIZAÇÃO DE PÁGINAS (ADMIN) ---

// Função de Login (Simples Admin/Guest)
async function renderLoginPage() {
    const el = document.getElementById('login-screen');
    el.innerHTML = `
        <div class="bg-white text-gray-800 p-8 rounded-lg shadow-2xl w-full max-w-md">
            <h2 class="text-2xl font-bold text-center mb-6 text-slate-800">Acesso Gestor</h2>
            <form id="form-login" onsubmit="event.preventDefault(); adminLogin();">
                <div class="mb-4">
                    <label for="login-user" class="block text-gray-700 text-sm font-bold mb-2">Usuário</label>
                    <input type="text" id="login-user" name="user" class="shadow appearance-none border rounded w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" value="admin" required>
                </div>
                <div class="mb-6">
                    <label for="login-pass" class="block text-gray-700 text-sm font-bold mb-2">Senha</label>
                    <input type="password" id="login-pass" name="pass" class="shadow appearance-none border rounded w-full py-3 px-4 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline" value="123456" required>
                </div>
                <div class="flex items-center justify-between">
                    <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg focus:outline-none focus:shadow-outline transition duration-150 w-full">Entrar</button>
                </div>
                <p id="login-error" class="text-red-500 text-xs italic mt-4 text-center hidden">Erro ao logar.</p>
            </form>
        </div>
    `;
    el.classList.remove('hidden');
}

// Funções de login
window.adminLogin = async () => {
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;
    const errorEl = document.getElementById('login-error');
    errorEl.classList.add('hidden');

    try {
        const docRef = doc(getColl('admins'), 'admin-user');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.user === user && data.pass === pass) {
                // Autenticação bem sucedida do Admin
                // Nota: Em um app real, o login usaria Firebase Auth. Aqui estamos simulando o acesso.
                
                // Simula o login usando o ID 'admin'
                if (auth.currentUser.uid === 'admin') {
                    isAdmin = true;
                    document.getElementById('login-screen').classList.add('hidden');
                    document.getElementById('sidebar').classList.remove('hidden');
                    document.getElementById('user-name-display').textContent = 'Admin';
                    router('dashboard');
                } else {
                    // O app usa o token customizado. Se o usuário anônimo logar, apenas simula o acesso.
                    isAdmin = true;
                    document.getElementById('login-screen').classList.add('hidden');
                    document.getElementById('sidebar').classList.remove('hidden');
                    document.getElementById('user-name-display').textContent = 'Admin';
                    router('dashboard');
                }
                
                return;
            }
        } else {
            // Cria o usuário admin padrão se não existir (primeiro acesso)
            await setDoc(docRef, { user: 'admin', pass: '123456' });
            if (user === 'admin' && pass === '123456') {
                isAdmin = true;
                document.getElementById('login-screen').classList.add('hidden');
                document.getElementById('sidebar').classList.remove('hidden');
                document.getElementById('user-name-display').textContent = 'Admin';
                router('dashboard');
                return;
            }
        }

        errorEl.textContent = 'Credenciais inválidas.';
        errorEl.classList.remove('hidden');

    } catch (e) {
        console.error("Error logging in: ", e);
        errorEl.textContent = 'Erro de conexão ou sistema.';
        errorEl.classList.remove('hidden');
    }
};

function renderDashboard() {
    const contentEl = document.getElementById('app-content');
    contentEl.innerHTML = `
        <div class="p-4 md:p-8">
            <h2 class="text-3xl font-extrabold mb-6 text-slate-800">Dashboard de Gestão RH</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                
                <!-- Card Colaboradores -->
                <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-100 transition duration-300 hover:shadow-xl">
                    <div class="flex items-center justify-between">
                        <i class="fa-solid fa-users text-3xl text-blue-500"></i>
                        <span class="text-xs font-semibold uppercase text-gray-500">Total de Colaboradores</span>
                    </div>
                    <p class="text-4xl font-bold text-gray-900 mt-2" id="dashboard-employees-count">0</p>
                    <a href="#employees" onclick="router('employees')" class="text-sm text-blue-500 hover:text-blue-700 mt-4 inline-block font-medium">Gerenciar Colaboradores &rarr;</a>
                </div>

                <!-- Card Cargos -->
                <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-100 transition duration-300 hover:shadow-xl">
                    <div class="flex items-center justify-between">
                        <i class="fa-solid fa-briefcase text-3xl text-green-500"></i>
                        <span class="text-xs font-semibold uppercase text-gray-500">Cargos Cadastrados</span>
                    </div>
                    <p class="text-4xl font-bold text-gray-900 mt-2">${cargos.length}</p>
                    <a href="#config" onclick="router('config')" class="text-sm text-green-500 hover:text-green-700 mt-4 inline-block font-medium">Configurar Estrutura &rarr;</a>
                </div>

                <!-- Card Redes/Lojas -->
                <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-100 transition duration-300 hover:shadow-xl">
                    <div class="flex items-center justify-between">
                        <i class="fa-solid fa-store text-3xl text-yellow-600"></i>
                        <span class="text-xs font-semibold uppercase text-gray-500">Lojas Atendidas</span>
                    </div>
                    <p class="text-4xl font-bold text-gray-900 mt-2">${lojas.length}</p>
                    <a href="#config" onclick="router('config')" class="text-sm text-yellow-600 hover:text-yellow-800 mt-4 inline-block font-medium">Gerenciar Lojas &rarr;</a>
                </div>

                <!-- Card Relatórios -->
                <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-100 transition duration-300 hover:shadow-xl">
                    <div class="flex items-center justify-between">
                        <i class="fa-solid fa-chart-line text-3xl text-red-500"></i>
                        <span class="text-xs font-semibold uppercase text-gray-500">Relatórios de Ponto</span>
                    </div>
                    <p class="text-4xl font-bold text-gray-900 mt-2">Pronto</p>
                    <a href="#reports" onclick="router('reports')" class="text-sm text-red-500 hover:text-red-700 mt-4 inline-block font-medium">Gerar Relatórios &rarr;</a>
                </div>

            </div>

            <!-- Colaboradores Recentes/Pendentes -->
            <div class="bg-white p-6 rounded-xl shadow-lg mt-8 border border-gray-100">
                <h3 class="text-2xl font-bold text-slate-800 mb-4">Colaboradores Recentes/Pendentes</h3>
                <div id="recent-employees-list">Carregando...</div>
            </div>
        </div>
    `;
    
    // Atualiza dinamicamente o contador e a lista
    onSnapshot(getColl('employees'), (snapshot) => {
        document.getElementById('dashboard-employees-count').textContent = snapshot.docs.length;

        const recentListEl = document.getElementById('recent-employees-list');
        if (recentListEl) {
            let employees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Ordena por data de criação (simulada ou campo real se houver)
            employees.sort((a, b) => (new Date(b.createdAt || 0)) - (new Date(a.createdAt || 0)));
            const pending = employees.filter(e => e.cargo === 'Novo (Aguardando)');
            const recent = employees.slice(0, 5);

            recentListEl.innerHTML = `
                <p class="mb-4 text-sm text-gray-600">Total Pendentes: <span class="font-bold text-red-500">${pending.length}</span></p>
                <div class="space-y-3">
                    ${recent.map(e => `
                        <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <span class="font-medium">${e.nomeCompleto}</span>
                            <span class="text-sm font-semibold px-3 py-1 rounded-full ${e.cargo === 'Novo (Aguardando)' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}">${e.cargo}</span>
                        </div>
                    `).join('')}
                </div>
                ${employees.length > 0 ? `<a href="#employees" onclick="router('employees')" class="text-sm text-blue-500 hover:text-blue-700 mt-4 block text-right font-medium">Ver todos &rarr;</a>` : '<p class="text-gray-500 mt-4">Nenhum colaborador cadastrado ainda.</p>'}
            `;
        }
    });
}

function renderEmployeesPage() {
    const contentEl = document.getElementById('app-content');
    contentEl.innerHTML = `
        <div class="p-4 md:p-8">
            <h2 class="text-3xl font-extrabold mb-6 text-slate-800">Gestão de Colaboradores</h2>
            <div class="flex justify-between items-center mb-6 no-print">
                <button onclick="showEmployeeModal('add')" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition duration-150">
                    <i class="fa-solid fa-user-plus"></i> Novo Colaborador
                </button>
            </div>
            
            <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-100 overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cargo</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Login</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider no-print">Ações</th>
                        </tr>
                    </thead>
                    <tbody id="employees-table-body" class="bg-white divide-y divide-gray-200">
                        <!-- Dados serão inseridos aqui pelo listener onSnapshot -->
                    </tbody>
                </table>
                <p id="employees-loading-message" class="py-4 text-center text-gray-500">Carregando colaboradores...</p>
            </div>
        </div>
    `;

    // Listener para Colaboradores (Employee)
    onSnapshot(getColl('employees'), (snapshot) => {
        const tableBody = document.getElementById('employees-table-body');
        const loadingMessage = document.getElementById('employees-loading-message');
        
        if (tableBody) {
            tableBody.innerHTML = '';
            loadingMessage.classList.add('hidden');
            
            if (snapshot.empty) {
                loadingMessage.textContent = 'Nenhum colaborador cadastrado.';
                loadingMessage.classList.remove('hidden');
                return;
            }

            snapshot.docs.forEach(doc => {
                const data = doc.data();
                const row = document.createElement('tr');
                row.className = 'hover:bg-gray-50 transition duration-100';
                row.innerHTML = `
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${data.nomeCompleto}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${data.cargo === 'Novo (Aguardando)' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}">
                            ${data.cargo || 'N/A'}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${data.loginUser}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2 no-print">
                        <button onclick="showEmployeeModal('edit', '${doc.id}')" class="text-indigo-600 hover:text-indigo-900"><i class="fa-solid fa-edit"></i> Editar</button>
                        <button onclick="deleteEmployee('${doc.id}', '${data.nomeCompleto}')" class="text-red-600 hover:text-red-900 ml-2"><i class="fa-solid fa-trash-alt"></i> Excluir</button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        }
    });
}

// Funções do Modal de Colaborador
window.showEmployeeModal = async (mode, id = null) => {
    const modalTitle = mode === 'add' ? 'Adicionar Colaborador' : 'Editar Colaborador';
    const btnText = mode === 'add' ? 'Cadastrar' : 'Salvar Alterações';
    const modalContent = document.getElementById('modal-content');
    
    // Opções de Cargo
    const cargoOptions = cargos.map(c => `<option value="${c.nome}">${c.nome}</option>`).join('');
    // Opções de Estados
    const estadoOptions = estados.map(e => `<option value="${e.uf}">${e.nome} (${e.uf})</option>`).join('');
    
    modalContent.innerHTML = `
        <h3 class="text-xl font-bold mb-4">${modalTitle}</h3>
        <form id="form-employee" onsubmit="event.preventDefault(); saveEmployee('${mode}', '${id}')">
            <input type="hidden" id="employee-id" value="${id || ''}">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                <div class="col-span-2 md:col-span-1">
                    <label class="block text-sm font-medium text-gray-700">Nome Completo</label>
                    <input type="text" id="e-nome" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" required>
                </div>
                <div class="col-span-2 md:col-span-1">
                    <label class="block text-sm font-medium text-gray-700">Cargo</label>
                    <select id="e-cargo" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" required>
                        <option value="">Selecione...</option>
                        <option value="Novo (Aguardando)">Novo (Aguardando)</option>
                        ${cargoOptions}
                    </select>
                </div>

                <div class="col-span-2 md:col-span-1">
                    <label class="block text-sm font-medium text-gray-700">CPF</label>
                    <input type="text" id="e-cpf" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
                </div>
                <div class="col-span-2 md:col-span-1">
                    <label class="block text-sm font-medium text-gray-700">RG</label>
                    <input type="text" id="e-rg" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
                </div>

                <div class="col-span-2 md:col-span-1">
                    <label class="block text-sm font-medium text-gray-700">Data de Nascimento</label>
                    <input type="date" id="e-nasc" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
                </div>
                <div class="col-span-2 md:col-span-1">
                    <label class="block text-sm font-medium text-gray-700">NIS/PIS</label>
                    <input type="text" id="e-pis" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
                </div>

                <div class="col-span-2">
                    <label class="block text-sm font-medium text-gray-700">Endereço Completo</label>
                    <input type="text" id="e-end" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
                </div>

                <div class="col-span-2 md:col-span-1">
                    <label class="block text-sm font-medium text-gray-700">Estado (UF)</label>
                    <select id="e-uf" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
                        <option value="">Selecione...</option>
                        ${estadoOptions}
                    </select>
                </div>
                <div class="col-span-2 md:col-span-1">
                    <label class="block text-sm font-medium text-gray-700">Município</label>
                    <input type="text" id="e-mun" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
                </div>

                <div class="col-span-2 md:col-span-1">
                    <label class="block text-sm font-medium text-gray-700">Login Usuário</label>
                    <input type="text" id="e-login" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" ${mode === 'edit' ? 'disabled' : ''} required>
                </div>
                <div class="col-span-2 md:col-span-1">
                    <label class="block text-sm font-medium text-gray-700">Login Senha</label>
                    <input type="text" id="e-pass" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" ${mode === 'edit' ? 'placeholder="Deixe em branco para não alterar"' : ''} required>
                </div>
                
                <div class="col-span-2">
                    <label class="block text-sm font-medium text-gray-700">Jornada (HH:MM)</label>
                    <input type="text" id="e-jornada" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" value="08:00" required>
                </div>

            </div>
            
            <div class="mt-6 flex justify-end gap-3">
                <button type="button" onclick="hideModal()" class="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-150">Cancelar</button>
                <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-150">${btnText}</button>
            </div>
            <p id="employee-message" class="text-sm text-center mt-3 hidden"></p>
        </form>
    `;

    if (mode === 'edit' && id) {
        const docSnap = await getDoc(doc(getColl('employees'), id));
        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('e-nome').value = data.nomeCompleto || '';
            document.getElementById('e-cargo').value = data.cargo || '';
            document.getElementById('e-cpf').value = data.cpf || '';
            document.getElementById('e-rg').value = data.rg || '';
            document.getElementById('e-nasc').value = data.dataNascimento || '';
            document.getElementById('e-pis').value = data.nisPIS || '';
            document.getElementById('e-end').value = data.endereco || '';
            document.getElementById('e-uf').value = data.estado || '';
            document.getElementById('e-mun').value = data.municipio || '';
            document.getElementById('e-login').value = data.loginUser || '';
            // Não preenche a senha em modo edição por segurança
            document.getElementById('e-pass').removeAttribute('required');
            document.getElementById('e-jornada').value = data.jornadaHHMM || '08:00';
        }
    } else {
        // Gera um login/senha inicial no modo 'add'
        const genUser = 'user' + Math.floor(Math.random() * 9000 + 1000);
        const genPass = Math.random().toString(36).slice(-6);
        document.getElementById('e-login').value = genUser;
        document.getElementById('e-pass').value = genPass;
    }

    document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById('modal-content-container').classList.remove('hidden');
};

window.saveEmployee = async (mode, id) => {
    const messageEl = document.getElementById('employee-message');
    messageEl.classList.remove('hidden', 'text-green-600', 'text-red-600');
    messageEl.classList.add('text-gray-600');
    messageEl.textContent = 'Salvando...';

    const employeeData = {
        nomeCompleto: document.getElementById('e-nome').value,
        cargo: document.getElementById('e-cargo').value,
        cpf: document.getElementById('e-cpf').value,
        rg: document.getElementById('e-rg').value,
        dataNascimento: document.getElementById('e-nasc').value,
        nisPIS: document.getElementById('e-pis').value,
        endereco: document.getElementById('e-end').value,
        estado: document.getElementById('e-uf').value,
        municipio: document.getElementById('e-mun').value,
        loginUser: document.getElementById('e-login').value,
        jornadaHHMM: document.getElementById('e-jornada').value,
        updatedAt: serverTimestamp()
    };
    
    const newPass = document.getElementById('e-pass').value;
    if (newPass) {
        employeeData.loginPass = newPass;
    } else if (mode === 'add') {
        // Se for adição e a senha estiver vazia (não deveria, pois está required), usa um padrão
        employeeData.loginPass = Math.random().toString(36).slice(-6);
    }

    try {
        if (mode === 'add') {
            employeeData.createdAt = serverTimestamp();
            await addDoc(getColl('employees'), employeeData);
            messageEl.textContent = 'Colaborador cadastrado com sucesso!';
        } else {
            await updateDoc(doc(getColl('employees'), id), employeeData);
            messageEl.textContent = 'Colaborador atualizado com sucesso!';
        }
        messageEl.classList.remove('text-gray-600');
        messageEl.classList.add('text-green-600');
        setTimeout(hideModal, 1500);

    } catch (e) {
        console.error("Erro ao salvar colaborador: ", e);
        messageEl.textContent = `Erro ao salvar: ${e.message}`;
        messageEl.classList.remove('text-gray-600');
        messageEl.classList.add('text-red-600');
    }
};

window.deleteEmployee = async (id, name) => {
    // Uso de modal customizado no lugar de confirm()
    showCustomModal('Confirmação', `Tem certeza que deseja EXCLUIR o colaborador <b>${name}</b>?`, 'Excluir', async () => {
        try {
            await deleteDoc(doc(getColl('employees'), id));
            showCustomModal('Sucesso', 'Colaborador excluído.', 'OK');
            hideModal(); // Fecha o modal de confirmação
        } catch (e) {
            console.error("Erro ao excluir colaborador: ", e);
            showCustomModal('Erro', `Não foi possível excluir o colaborador: ${e.message}`, 'OK');
        }
    });
};

// ... (Outras funções de renderização de páginas: renderReportsPage, renderConfigPage, renderHolidaysPage, renderLinksPage, renderPointPage, renderAutoRegisterPage)

function renderReportsPage() {
    const contentEl = document.getElementById('app-content');
    contentEl.innerHTML = `
        <div class="p-4 md:p-8">
            <h2 class="text-3xl font-extrabold mb-6 text-slate-800 no-print">Relatórios de Ponto</h2>
            <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-100 no-print mb-6">
                <h3 class="text-xl font-semibold mb-4 text-slate-700">Gerar Relatório Mensal</h3>
                <form id="form-report" onsubmit="event.preventDefault(); generateReport()">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label for="report-month" class="block text-sm font-medium text-gray-700">Mês/Ano</label>
                            <input type="month" id="report-month" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" required>
                        </div>
                        <div>
                            <label for="report-employee" class="block text-sm font-medium text-gray-700">Colaborador</label>
                            <select id="report-employee" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
                                <option value="all">Todos os Colaboradores</option>
                                <!-- Opções de Colaborador serão carregadas aqui -->
                            </select>
                        </div>
                        <div class="flex items-end">
                            <button type="submit" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition duration-150 w-full">
                                <i class="fa-solid fa-file-export"></i> Gerar Relatório
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            <div id="report-output-container" class="mt-8">
                <!-- O relatório será gerado aqui -->
                <p class="text-center text-gray-500">Selecione o mês e o colaborador para gerar o relatório.</p>
            </div>
        </div>
    `;

    // Carrega as opções de colaborador
    const employeeSelect = document.getElementById('report-employee');
    onSnapshot(getColl('employees'), (snapshot) => {
        employeeSelect.innerHTML = '<option value="all">Todos os Colaboradores</option>';
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = data.nomeCompleto;
            employeeSelect.appendChild(option);
        });
    });

    // Define o mês/ano atual como padrão
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    document.getElementById('report-month').value = `${year}-${month}`;
}

window.generateReport = async () => {
    const monthYear = document.getElementById('report-month').value;
    const employeeId = document.getElementById('report-employee').value;
    const [year, month] = monthYear.split('-').map(Number);
    
    if (!year || !month) {
        showCustomModal('Erro', 'Por favor, selecione um Mês e Ano válidos.', 'OK');
        return;
    }

    const outputContainer = document.getElementById('report-output-container');
    outputContainer.innerHTML = '<div class="flex justify-center mt-8"><div class="loader"></div><p class="ml-3 text-gray-600">Gerando relatório...</p></div>';

    let employeesToReport = [];
    if (employeeId === 'all') {
        const snapshot = await getDocs(getColl('employees'));
        employeesToReport = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } else {
        const docSnap = await getDoc(doc(getColl('employees'), employeeId));
        if (docSnap.exists()) {
            employeesToReport.push({ id: docSnap.id, ...docSnap.data() });
        }
    }

    if (employeesToReport.length === 0) {
        outputContainer.innerHTML = '<p class="text-center text-red-500 mt-8">Nenhum colaborador encontrado para o relatório.</p>';
        return;
    }

    // Filtra os feriados para o estado/município (lógica de feriados simplificada)
    const holidays = feriados.filter(f => f.nivel === 'nacional'); // Apenas nacional por simplicidade
    
    const allPointsSnapshot = await getDocs(getColl('points'));
    const allPoints = allPointsSnapshot.docs.map(doc => doc.data());

    let reportHTML = `<div class="p-4 md:p-8 bg-white rounded-xl shadow-lg print-only">`;
    reportHTML += `<div class="flex justify-end no-print mb-4"><button onclick="window.print()" class="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition duration-150"><i class="fa-solid fa-print"></i> Imprimir Relatório</button></div>`;

    employeesToReport.forEach(employee => {
        const employeePoints = allPoints.filter(p => p.employeeId === employee.id && 
            new Date(p.timestamp.toDate()).getFullYear() === year && 
            new Date(p.timestamp.toDate()).getMonth() + 1 === month
        ).sort((a, b) => a.timestamp.toDate() - b.timestamp.toDate());

        // Agrupa os pontos por dia
        const dailyPoints = employeePoints.reduce((acc, point) => {
            const dateStr = point.timestamp.toDate().toISOString().substring(0, 10);
            if (!acc[dateStr]) acc[dateStr] = [];
            acc[dateStr].push(point);
            return acc;
        }, {});
        
        const daysInMonth = new Date(year, month, 0).getDate();
        const jornadaSegundos = employee.jornadaHHMM ? (parseInt(employee.jornadaHHMM.substring(0, 2)) * 3600 + parseInt(employee.jornadaHHMM.substring(3, 5)) * 60) : (8 * 3600);
        let totalHorasTrabalhadas = 0;
        let totalHorasExtras = 0;

        reportHTML += `
            <div class="report-header-print text-center mb-6">
                <img src="${configData.logo || 'https://placehold.co/100x30/334155/ffffff?text=RH'}" class="h-8 mx-auto mb-2" alt="Logo">
                <h1 class="text-xl font-bold text-gray-900">${configData.companyName || 'Relatório de Ponto'}</h1>
                <p class="text-sm text-gray-600">Relatório Mensal de Ponto - ${String(month).padStart(2, '0')}/${year}</p>
            </div>
            
            <div class="report-data-print grid grid-cols-2 gap-4 text-sm mb-6">
                <div>
                    <b>Colaborador:</b> ${employee.nomeCompleto}<br>
                    <b>Cargo:</b> ${employee.cargo}
                </div>
                <div>
                    <b>Jornada Padrão:</b> ${employee.jornadaHHMM}<br>
                    <b>Estado/Município:</b> ${employee.estado} / ${employee.municipio}
                </div>
            </div>

            <table class="min-w-full divide-y divide-gray-200 border border-gray-300 shadow-md">
                <thead class="bg-gray-100">
                    <tr>
                        <th class="border border-gray-300 px-4 py-2 text-left text-xs font-bold text-gray-600 uppercase">Dia</th>
                        <th class="border border-gray-300 px-4 py-2 text-left text-xs font-bold text-gray-600 uppercase">Entrada</th>
                        <th class="border border-gray-300 px-4 py-2 text-left text-xs font-bold text-gray-600 uppercase">Saída Almoço</th>
                        <th class="border border-gray-300 px-4 py-2 text-left text-xs font-bold text-gray-600 uppercase">Volta Almoço</th>
                        <th class="border border-gray-300 px-4 py-2 text-left text-xs font-bold text-gray-600 uppercase">Saída</th>
                        <th class="border border-gray-300 px-4 py-2 text-right text-xs font-bold text-gray-600 uppercase">Total (HH:MM)</th>
                        <th class="border border-gray-300 px-4 py-2 text-right text-xs font-bold text-gray-600 uppercase">Horas Extras</th>
                        <th class="border border-gray-300 px-4 py-2 text-left text-xs font-bold text-gray-600 uppercase">Observação</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
        `;

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const dateStr = date.toISOString().substring(0, 10);
            const dayOfWeek = date.getDay(); // 0 = Dom, 6 = Sáb
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const isHoliday = holidays.some(h => new Date(h.data).toISOString().substring(0, 10) === dateStr);
            
            const points = dailyPoints[dateStr] || [];
            const times = points.map(p => p.timestamp.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
            
            let totalDiaSegundos = 0;
            let totalDiaHHMM = '00:00';
            let horasExtrasDia = '00:00';

            // Calcula a diferença entre pares de pontos (Entrada - Saída Almoço) + (Volta Almoço - Saída)
            if (points.length >= 2 && points.length % 2 === 0) {
                for (let i = 0; i < points.length; i += 2) {
                    if (points[i] && points[i+1]) {
                        totalDiaSegundos += (points[i+1].timestamp.toDate().getTime() - points[i].timestamp.toDate().getTime()) / 1000;
                    }
                }
                
                totalHorasTrabalhadas += totalDiaSegundos;

                // Converte totalDiaSegundos para HH:MM
                const totalH = Math.floor(totalDiaSegundos / 3600);
                const totalM = Math.floor((totalDiaSegundos % 3600) / 60);
                totalDiaHHMM = `${String(totalH).padStart(2, '0')}:${String(totalM).padStart(2, '0')}`;

                // Calcula Horas Extras
                if (totalDiaSegundos > jornadaSegundos) {
                    const extraSegundos = totalDiaSegundos - jornadaSegundos;
                    totalHorasExtras += extraSegundos;
                    const extraH = Math.floor(extraSegundos / 3600);
                    const extraM = Math.floor((extraSegundos % 3600) / 60);
                    horasExtrasDia = `${String(extraH).padStart(2, '0')}:${String(extraM).padStart(2, '0')}`;
                }
            }


            let observation = '';
            let rowClass = 'text-gray-900';
            if (isHoliday) {
                observation = 'Feriado';
                rowClass = 'bg-yellow-50 text-yellow-800 font-semibold';
            } else if (isWeekend) {
                observation = 'Fim de Semana';
                rowClass = 'bg-gray-50 text-gray-600';
            } else if (points.length === 0) {
                observation = 'Falta/Não Registrado';
                rowClass = 'bg-red-50 text-red-800 font-semibold';
            } else if (points.length % 2 !== 0) {
                observation = 'Registro Incompleto';
                rowClass = 'bg-orange-50 text-orange-800';
            }

            reportHTML += `
                <tr class="${rowClass}">
                    <td class="border border-gray-300 px-4 py-2 whitespace-nowrap text-sm font-medium">${day}</td>
                    <td class="border border-gray-300 px-4 py-2 whitespace-nowrap text-sm">${times[0] || '-'}</td>
                    <td class="border border-gray-300 px-4 py-2 whitespace-nowrap text-sm">${times[1] || '-'}</td>
                    <td class="border border-gray-300 px-4 py-2 whitespace-nowrap text-sm">${times[2] || '-'}</td>
                    <td class="border border-gray-300 px-4 py-2 whitespace-nowrap text-sm">${times[3] || '-'}</td>
                    <td class="border border-gray-300 px-4 py-2 whitespace-nowrap text-sm text-right font-medium">${totalDiaHHMM}</td>
                    <td class="border border-gray-300 px-4 py-2 whitespace-nowrap text-sm text-right font-medium text-green-700">${horasExtrasDia}</td>
                    <td class="border border-gray-300 px-4 py-2 whitespace-nowrap text-sm">${observation}</td>
                </tr>
            `;
        }

        // Soma total
        const totalH = Math.floor(totalHorasTrabalhadas / 3600);
        const totalM = Math.floor((totalHorasTrabalhadas % 3600) / 60);
        const totalGeralHHMM = `${String(totalH).padStart(2, '0')}:${String(totalM).padStart(2, '0')}`;

        const extraH = Math.floor(totalHorasExtras / 3600);
        const extraM = Math.floor((totalHorasExtras % 3600) / 60);
        const totalExtraHHMM = `${String(extraH).padStart(2, '0')}:${String(extraM).padStart(2, '0')}`;


        reportHTML += `
                </tbody>
                <tfoot>
                    <tr class="bg-blue-50">
                        <td colspan="5" class="border border-gray-300 px-4 py-2 text-right text-sm font-bold uppercase">Total do Mês:</td>
                        <td class="border border-gray-300 px-4 py-2 text-right text-sm font-bold">${totalGeralHHMM}</td>
                        <td class="border border-gray-300 px-4 py-2 text-right text-sm font-bold text-green-700">${totalExtraHHMM}</td>
                        <td class="border border-gray-300 px-4 py-2 text-sm"></td>
                    </tr>
                </tfoot>
            </table>
            <div class="mt-8 pt-4 border-t border-gray-300 text-sm">
                <p><b>Legenda:</b> <span class="bg-red-50 text-red-800 px-2 rounded">Falta/Não Registrado</span> | <span class="bg-yellow-50 text-yellow-800 px-2 rounded">Feriado</span></p>
                <p class="mt-4">Declaro que as informações acima são verídicas. <br><br>_____________________________<br>Assinatura do Colaborador</p>
            </div>
            <div class="page-break-after"></div>
        `;
    });

    reportHTML += `</div>`;
    outputContainer.innerHTML = reportHTML;
};


function renderConfigPage() {
    const contentEl = document.getElementById('app-content');
    contentEl.innerHTML = `
        <div class="p-4 md:p-8">
            <h2 class="text-3xl font-extrabold mb-6 text-slate-800">Configurações e Estrutura</h2>
            
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                <!-- Geral/Logo -->
                <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-100 lg:col-span-1">
                    <h3 class="text-xl font-semibold mb-4 text-slate-700 border-b pb-2">Configurações Gerais (Logo)</h3>
                    <form id="form-config" onsubmit="event.preventDefault(); saveConfig()">
                        <div class="mb-4">
                            <label for="company-name-input" class="block text-sm font-medium text-gray-700">Nome da Empresa</label>
                            <input type="text" id="company-name-input" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" value="${configData.companyName || ''}">
                        </div>
                        <div class="mb-4">
                            <label for="logo-upload" class="block text-sm font-medium text-gray-700">Upload de Logo (PNG/JPG < 100KB)</label>
                            <input type="file" id="logo-upload" accept="image/png, image/jpeg" class="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100">
                        </div>
                        <div class="mb-4 text-center">
                            <img id="current-logo-preview" src="${configData.logo || 'https://placehold.co/150x50/cccccc/000000?text=LOGO'}" class="w-24 h-8 object-contain mx-auto border p-1 rounded-md" alt="Logo Preview">
                            <p class="text-xs text-gray-500 mt-1">Logo Atual</p>
                        </div>
                        <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-150 w-full">Salvar Configurações</button>
                        <p id="config-message" class="text-sm text-center mt-3 hidden"></p>
                    </form>
                </div>

                <!-- Cargos -->
                <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-100 lg:col-span-2">
                    <h3 class="text-xl font-semibold mb-4 text-slate-700 border-b pb-2">Gestão de Cargos</h3>
                    <form onsubmit="event.preventDefault(); addStructureItem('cargos', 'cargo-name')" class="flex gap-2 mb-4">
                        <input type="text" id="cargo-name" placeholder="Nome do Cargo (Ex: Promotor Fixo)" class="flex-1 rounded-md border-gray-300 shadow-sm p-2 border" required>
                        <button type="submit" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition duration-150"><i class="fa-solid fa-plus"></i> Add</button>
                    </form>
                    <div id="cargos-list" class="space-y-2">
                        ${cargos.length > 0 ? cargos.map(c => renderStructureItem(c.id, c.nome, 'cargos')).join('') : '<p class="text-gray-500">Nenhum cargo cadastrado.</p>'}
                    </div>
                </div>

                <!-- Estados Atendidos -->
                <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-100 lg:col-span-3">
                    <h3 class="text-xl font-semibold mb-4 text-slate-700 border-b pb-2">Estados Atendidos (UF)</h3>
                    <form onsubmit="event.preventDefault(); addEstado()" class="flex gap-2 mb-4">
                        <input type="text" id="estado-uf" placeholder="UF (Ex: SP)" class="w-20 rounded-md border-gray-300 shadow-sm p-2 border uppercase" maxlength="2" required>
                        <input type="text" id="estado-name" placeholder="Nome do Estado (Ex: São Paulo)" class="flex-1 rounded-md border-gray-300 shadow-sm p-2 border" required>
                        <button type="submit" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition duration-150"><i class="fa-solid fa-plus"></i> Add</button>
                    </form>
                    <div id="estados-list" class="flex flex-wrap gap-3">
                        ${estados.length > 0 ? estados.map(e => `<span class="bg-gray-200 text-gray-800 px-3 py-1 rounded-full text-sm">${e.nome} (${e.uf}) <button onclick="deleteStructureItem('estados', '${e.id}', '${e.nome}')" class="ml-1 text-red-500 hover:text-red-700"><i class="fa-solid fa-times-circle"></i></button></span>`).join('') : '<p class="text-gray-500">Nenhum estado cadastrado.</p>'}
                    </div>
                </div>

                <!-- Redes e Lojas -->
                <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-100 lg:col-span-3">
                    <h3 class="text-xl font-semibold mb-4 text-slate-700 border-b pb-2">Redes e Lojas (Varejo)</h3>
                    
                    <h4 class="font-bold mt-4 mb-2">Redes</h4>
                    <form onsubmit="event.preventDefault(); addStructureItem('redes', 'rede-name')" class="flex gap-2 mb-4">
                        <input type="text" id="rede-name" placeholder="Nome da Rede (Ex: Supermercados X)" class="flex-1 rounded-md border-gray-300 shadow-sm p-2 border" required>
                        <button type="submit" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition duration-150"><i class="fa-solid fa-plus"></i> Add</button>
                    </form>
                    <div id="redes-list" class="space-y-2 mb-6">
                        ${redes.length > 0 ? redes.map(r => renderStructureItem(r.id, r.nome, 'redes')).join('') : '<p class="text-gray-500">Nenhuma rede cadastrada.</p>'}
                    </div>

                    <h4 class="font-bold mt-4 mb-2">Lojas</h4>
                    <form onsubmit="event.preventDefault(); addLoja()" class="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
                        <select id="loja-rede" class="col-span-1 rounded-md border-gray-300 shadow-sm p-2 border" required>
                            <option value="">Selecione a Rede...</option>
                            ${redes.map(r => `<option value="${r.nome}">${r.nome}</option>`).join('')}
                        </select>
                        <input type="text" id="loja-name" placeholder="Nome da Loja/Unidade" class="col-span-2 rounded-md border-gray-300 shadow-sm p-2 border" required>
                        <button type="submit" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition duration-150"><i class="fa-solid fa-plus"></i> Add Loja</button>
                    </form>
                    <div id="lojas-list" class="space-y-2">
                        ${lojas.length > 0 ? lojas.map(l => renderLojaItem(l.id, l.rede, l.nome)).join('') : '<p class="text-gray-500">Nenhuma loja cadastrada.</p>'}
                    </div>
                </div>

            </div>
        </div>
    `;

    // Preview do logo
    document.getElementById('logo-upload').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('current-logo-preview').src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    // Função auxiliar para renderizar item de estrutura (Cargo/Rede)
    window.renderStructureItem = (id, nome, collectionName) => `
        <div class="flex justify-between items-center p-2 bg-gray-50 rounded border">
            <span>${nome}</span>
            <button onclick="deleteStructureItem('${collectionName}', '${id}', '${nome}')" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash-alt"></i> Excluir</button>
        </div>
    `;
    
    // Função auxiliar para renderizar item de loja
    window.renderLojaItem = (id, rede, nome) => `
        <div class="flex justify-between items-center p-2 bg-gray-50 rounded border">
            <span><b>[${rede}]</b> ${nome}</span>
            <button onclick="deleteStructureItem('lojas', '${id}', '${nome}')" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash-alt"></i> Excluir</button>
        </div>
    `;

}

window.saveConfig = async () => {
    const messageEl = document.getElementById('config-message');
    messageEl.classList.remove('hidden', 'text-green-600', 'text-red-600');
    messageEl.classList.add('text-gray-600');
    messageEl.textContent = 'Salvando...';

    const companyName = document.getElementById('company-name-input').value;
    const file = document.getElementById('logo-upload').files[0];
    let logoUrl = configData.logo || '';

    try {
        if (file) {
            if (file.size > 100 * 1024) { // Limite de 100KB
                throw new Error("O arquivo da logo é muito grande. Use uma imagem menor que 100KB.");
            }
            
            // Converte a imagem para Base64 (simplificado, já que o README menciona Base64)
            const reader = new FileReader();
            const base64Promise = new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result);
                reader.onerror = error => reject(error);
                reader.readAsDataURL(file);
            });
            logoUrl = await base64Promise;
        }

        const dataToSave = {
            companyName: companyName,
            logo: logoUrl
        };

        await setDoc(doc(getColl('config'), 'global'), dataToSave);
        messageEl.textContent = 'Configurações salvas com sucesso!';
        messageEl.classList.remove('text-gray-600');
        messageEl.classList.add('text-green-600');
    } catch (e) {
        console.error("Erro ao salvar configuração: ", e);
        messageEl.textContent = `Erro ao salvar: ${e.message}`;
        messageEl.classList.remove('text-gray-600');
        messageEl.classList.add('text-red-600');
    }
}

window.addStructureItem = async (collectionName, inputId) => {
    const nome = document.getElementById(inputId).value;
    if (!nome) return;

    try {
        await addDoc(getColl(collectionName), { nome: nome });
        document.getElementById(inputId).value = '';
    } catch (e) {
        console.error(`Erro ao adicionar item em ${collectionName}: `, e);
        showCustomModal('Erro', `Não foi possível adicionar o item: ${e.message}`, 'OK');
    }
}

window.addEstado = async () => {
    const uf = document.getElementById('estado-uf').value.toUpperCase();
    const nome = document.getElementById('estado-name').value;
    if (!uf || !nome) return;

    try {
        await addDoc(getColl('estados'), { uf: uf, nome: nome });
        document.getElementById('estado-uf').value = '';
        document.getElementById('estado-name').value = '';
    } catch (e) {
        console.error(`Erro ao adicionar estado: `, e);
        showCustomModal('Erro', `Não foi possível adicionar o estado: ${e.message}`, 'OK');
    }
}

window.addLoja = async () => {
    const rede = document.getElementById('loja-rede').value;
    const nome = document.getElementById('loja-name').value;
    if (!rede || !nome) return;

    try {
        await addDoc(getColl('lojas'), { rede: rede, nome: nome });
        document.getElementById('loja-name').value = '';
        // A rede deve ser mantida, talvez
    } catch (e) {
        console.error(`Erro ao adicionar loja: `, e);
        showCustomModal('Erro', `Não foi possível adicionar a loja: ${e.message}`, 'OK');
    }
}

window.deleteStructureItem = async (collectionName, id, name) => {
    showCustomModal('Confirmação', `Tem certeza que deseja EXCLUIR o item <b>${name}</b>?`, 'Excluir', async () => {
        try {
            await deleteDoc(doc(getColl(collectionName), id));
            showCustomModal('Sucesso', 'Item excluído.', 'OK');
        } catch (e) {
            console.error("Erro ao excluir item: ", e);
            showCustomModal('Erro', `Não foi possível excluir o item: ${e.message}`, 'OK');
        }
    });
}


function renderHolidaysPage() {
    const contentEl = document.getElementById('app-content');
    
    // Opções de Nível
    const nivelOptions = [
        { value: 'nacional', label: 'Nacional' },
        { value: 'estadual', label: 'Estadual' },
        { value: 'municipal', label: 'Municipal' }
    ];
    
    // Opções de Estado para nível Estadual/Municipal
    const estadoOptions = estados.map(e => `<option value="${e.uf}">${e.uf} - ${e.nome}</option>`).join('');

    contentEl.innerHTML = `
        <div class="p-4 md:p-8">
            <h2 class="text-3xl font-extrabold mb-6 text-slate-800">Cadastro de Feriados</h2>
            
            <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-100 mb-6">
                <h3 class="text-xl font-semibold mb-4 text-slate-700 border-b pb-2">Adicionar Novo Feriado</h3>
                <form onsubmit="event.preventDefault(); addHoliday()" class="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div class="md:col-span-2">
                        <label for="holiday-name" class="block text-sm font-medium text-gray-700">Nome do Feriado</label>
                        <input type="text" id="holiday-name" placeholder="Ex: Natal" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" required>
                    </div>
                    <div>
                        <label for="holiday-date" class="block text-sm font-medium text-gray-700">Data</label>
                        <input type="date" id="holiday-date" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" required>
                    </div>
                    <div>
                        <label for="holiday-level" class="block text-sm font-medium text-gray-700">Nível</label>
                        <select id="holiday-level" onchange="toggleHolidayLocation()" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" required>
                            ${nivelOptions.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
                        </select>
                    </div>
                    <div id="holiday-location-fields" class="hidden">
                        <label for="holiday-state" class="block text-sm font-medium text-gray-700">Local (Estado/Município)</label>
                        <select id="holiday-state" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
                            <option value="">Selecione o Estado (Obrigatório)</option>
                            ${estadoOptions}
                        </select>
                        <input type="text" id="holiday-city" placeholder="Município (Opcional)" class="mt-2 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
                    </div>
                    <div class="flex items-end">
                        <button type="submit" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition duration-150 w-full"><i class="fa-solid fa-plus"></i> Adicionar</button>
                    </div>
                </form>
                <p id="holiday-message" class="text-sm text-center mt-3 hidden"></p>
            </div>

            <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-100 overflow-x-auto">
                <h3 class="text-xl font-semibold mb-4 text-slate-700 border-b pb-2">Feriados Cadastrados</h3>
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nível</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Local</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider no-print">Ações</th>
                        </tr>
                    </thead>
                    <tbody id="holidays-table-body" class="bg-white divide-y divide-gray-200">
                        ${feriados.length > 0 ? feriados.sort((a, b) => new Date(a.data) - new Date(b.data)).map(f => `
                            <tr class="hover:bg-gray-50 transition duration-100">
                                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${f.data ? new Date(f.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A'}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${f.nome}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">${f.nivel}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${f.estado ? `${f.estado}${f.municipio ? ` (${f.municipio})` : ''}` : 'N/A'}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium no-print">
                                    <button onclick="deleteStructureItem('feriados', '${f.id}', '${f.nome}')" class="text-red-600 hover:text-red-900"><i class="fa-solid fa-trash-alt"></i> Excluir</button>
                                </td>
                            </tr>
                        `).join('') : `<tr><td colspan="5" class="text-center py-4 text-gray-500">Nenhum feriado cadastrado.</td></tr>`}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    window.toggleHolidayLocation = () => {
        const level = document.getElementById('holiday-level').value;
        const locationFields = document.getElementById('holiday-location-fields');
        if (level === 'estadual' || level === 'municipal') {
            locationFields.classList.remove('hidden');
            document.getElementById('holiday-state').setAttribute('required', 'true');
        } else {
            locationFields.classList.add('hidden');
            document.getElementById('holiday-state').removeAttribute('required');
        }
    };

    window.addHoliday = async () => {
        const messageEl = document.getElementById('holiday-message');
        messageEl.classList.remove('hidden', 'text-green-600', 'text-red-600');
        messageEl.classList.add('text-gray-600');
        messageEl.textContent = 'Adicionando...';

        const nome = document.getElementById('holiday-name').value;
        const data = document.getElementById('holiday-date').value;
        const nivel = document.getElementById('holiday-level').value;
        const estado = document.getElementById('holiday-state').value;
        const municipio = document.getElementById('holiday-city').value;
        
        const holidayData = { nome, data, nivel, estado: '', municipio: '' };

        if (nivel === 'estadual' || nivel === 'municipal') {
            if (!estado) {
                messageEl.textContent = 'Selecione o Estado para feriados estaduais/municipais.';
                messageEl.classList.add('text-red-600');
                return;
            }
            holidayData.estado = estado;
            if (nivel === 'municipal') {
                holidayData.municipio = municipio || ''; // Município é opcional, mas recomendado
            }
        }
        
        try {
            await addDoc(getColl('feriados'), holidayData);
            messageEl.textContent = 'Feriado adicionado com sucesso!';
            messageEl.classList.add('text-green-600');
            
            // Limpa os campos
            document.getElementById('form-holiday').reset();
            document.getElementById('holiday-location-fields').classList.add('hidden');
        } catch (e) {
            console.error("Erro ao adicionar feriado: ", e);
            messageEl.textContent = `Erro ao adicionar: ${e.message}`;
            messageEl.classList.add('text-red-600');
        }
    };
}


function renderLinksPage() {
    const contentEl = document.getElementById('app-content');
    const pontoLink = `${window.location.origin}${window.location.pathname}#ponto`;
    const autocadastroLink = `${window.location.origin}${window.location.pathname}#autocadastro`;

    contentEl.innerHTML = `
        <div class="p-4 md:p-8">
            <h2 class="text-3xl font-extrabold mb-6 text-slate-800">Links de Acesso Público</h2>
            <div class="space-y-6">
                
                <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
                    <h3 class="text-xl font-semibold mb-4 text-slate-700">Link do Ponto Eletrônico</h3>
                    <p class="text-gray-600 mb-4">Compartilhe este link com os colaboradores para que eles possam registrar o ponto (requer login individual).</p>
                    <div class="flex flex-col md:flex-row gap-2">
                        <input type="text" id="ponto-link" value="${pontoLink}" class="flex-1 rounded-md border-gray-300 shadow-sm p-3 border bg-gray-50 font-mono text-sm" readonly>
                        <button onclick="copyToClipboard('ponto-link')" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition duration-150 flex items-center justify-center gap-2">
                            <i class="fa-solid fa-copy"></i> Copiar
                        </button>
                    </div>
                </div>

                <div class="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
                    <h3 class="text-xl font-semibold mb-4 text-slate-700">Link de Autocadastro de Colaborador</h3>
                    <p class="text-gray-600 mb-4">Use este link para permitir que novos candidatos ou funcionários preencham seus dados básicos antes da aprovação.</p>
                    <div class="flex flex-col md:flex-row gap-2">
                        <input type="text" id="autocadastro-link" value="${autocadastroLink}" class="flex-1 rounded-md border-gray-300 shadow-sm p-3 border bg-gray-50 font-mono text-sm" readonly>
                        <button onclick="copyToClipboard('autocadastro-link')" class="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg transition duration-150 flex items-center justify-center gap-2">
                            <i class="fa-solid fa-copy"></i> Copiar
                        </button>
                    </div>
                </div>

            </div>
        </div>
    `;

    window.copyToClipboard = (elementId) => {
        const copyText = document.getElementById(elementId);
        copyText.select();
        copyText.setSelectionRange(0, 99999); 
        try {
            document.execCommand('copy');
            showCustomModal('Copiado!', 'O link foi copiado para a área de transferência.', 'OK');
        } catch (err) {
            showCustomModal('Erro', 'Não foi possível copiar o link. Tente manualmente.', 'OK');
        }
    };
}


// --- PÁGINAS PÚBLICAS ---

function renderPointPage() {
    const contentEl = document.getElementById('app-content');
    contentEl.innerHTML = `
        <div class="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
            <div class="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md text-center border border-blue-100">
                <img src="${configData.logo || 'https://placehold.co/150x50/334155/ffffff?text=RH'}" class="h-10 object-contain mx-auto mb-6" alt="Logo">
                <h2 class="text-2xl font-bold mb-6 text-slate-800">${configData.companyName || 'Ponto Eletrônico'}</h2>
                
                <div id="point-interface">
                    <form id="form-point-login" onsubmit="event.preventDefault(); pointLogin()">
                        <p class="text-lg font-medium mb-4 text-gray-700">Login Colaborador</p>
                        <div class="mb-4">
                            <input type="text" id="ponto-user" placeholder="Usuário (Login)" class="shadow appearance-none border rounded w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:shadow-outline" required>
                        </div>
                        <div class="mb-6">
                            <input type="password" id="ponto-pass" placeholder="Senha" class="shadow appearance-none border rounded w-full py-3 px-4 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline" required>
                        </div>
                        <div class="mb-4 text-left">
                            <label class="inline-flex items-center">
                                <input type="checkbox" id="manter-conectado" class="form-checkbox h-5 w-5 text-blue-600 rounded">
                                <span class="ml-2 text-gray-700 text-sm">Manter conectado</span>
                            </label>
                        </div>
                        <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg focus:outline-none focus:shadow-outline transition duration-150 w-full">Entrar</button>
                        <p id="ponto-error" class="text-red-500 text-xs italic mt-4 text-center hidden"></p>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    // Tenta reautenticar se houver dados salvos (simplificado)
    const savedLogin = JSON.parse(localStorage.getItem('pontoUser')) || {};
    if (savedLogin.user && savedLogin.pass) {
        document.getElementById('ponto-user').value = savedLogin.user;
        document.getElementById('ponto-pass').value = savedLogin.pass;
        document.getElementById('manter-conectado').checked = true;
        // Tenta logar automaticamente (para um app real, seria melhor usar um token)
        pointLogin(savedLogin.user, savedLogin.pass);
    }
}

window.pointLogin = async (savedUser = null, savedPass = null) => {
    const user = savedUser || document.getElementById('ponto-user').value;
    const pass = savedPass || document.getElementById('ponto-pass').value;
    const errorEl = document.getElementById('ponto-error');
    const manterConectado = document.getElementById('manter-conectado')?.checked;
    errorEl.classList.add('hidden');

    try {
        const employeesRef = getColl('employees');
        const q = query(employeesRef, where('loginUser', '==', user), where('loginPass', '==', pass));
        const employeeSnapshot = await getDocs(q);

        if (!employeeSnapshot.empty) {
            const employeeDoc = employeeSnapshot.docs[0];
            const employeeData = { id: employeeDoc.id, ...employeeDoc.data() };
            
            // Logado com sucesso
            document.getElementById('ponto-interface').innerHTML = `
                <i class="fa-solid fa-user-check text-5xl text-green-500 mb-4"></i>
                <h3 class="text-xl font-bold mb-2">Bem-vindo(a), ${employeeData.nomeCompleto}!</h3>
                <p class="text-gray-600 mb-6">Pronto para registrar o ponto.</p>
                <button onclick="registerPoint('${employeeData.id}', '${employeeData.nomeCompleto}')" class="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg focus:outline-none focus:shadow-outline transition duration-150 w-full flex items-center justify-center gap-2">
                    <i class="fa-solid fa-clock"></i> Bater Ponto Agora (${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit'})})
                </button>
                <button onclick="pointLogout()" class="mt-4 text-sm text-red-500 hover:text-red-700">Sair/Trocar Usuário</button>
                <div id="point-register-message" class="text-sm mt-4"></div>
            `;
            
            // Salva o login se "Manter conectado" estiver marcado
            if (manterConectado) {
                localStorage.setItem('pontoUser', JSON.stringify({ user, pass }));
            } else {
                localStorage.removeItem('pontoUser');
            }

        } else {
            errorEl.textContent = 'Usuário ou senha inválidos.';
            errorEl.classList.remove('hidden');
        }

    } catch (e) {
        console.error("Error logging in ponto: ", e);
        errorEl.textContent = 'Erro de conexão ou sistema.';
        errorEl.classList.remove('hidden');
    }
};

window.pointLogout = () => {
    localStorage.removeItem('pontoUser');
    router('ponto');
}

window.registerPoint = async (employeeId, employeeName) => {
    const messageEl = document.getElementById('point-register-message');
    messageEl.innerHTML = '<span class="text-gray-600">Registrando ponto...</span>';
    
    try {
        const pointData = {
            employeeId: employeeId,
            employeeName: employeeName,
            timestamp: serverTimestamp(),
            type: 'manual', // Indica que foi batido no sistema
            location: 'N/A' // Simples, já que não temos GPS
        };

        await addDoc(getColl('points'), pointData);
        messageEl.innerHTML = `<span class="text-green-600 font-bold">Ponto registrado com sucesso às ${new Date().toLocaleTimeString('pt-BR')}!</span>`;
        
        // Atualiza o botão para mostrar o novo horário
        document.querySelector('button[onclick^="registerPoint"]').innerHTML = `<i class="fa-solid fa-clock"></i> Bater Ponto Agora (${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit'})})`;
        document.querySelector('button[onclick^="registerPoint"]').classList.remove('bg-green-600');
        document.querySelector('button[onclick^="registerPoint"]').classList.add('bg-orange-600');

    } catch (e) {
        console.error("Erro ao registrar ponto: ", e);
        messageEl.innerHTML = `<span class="text-red-600">Erro ao registrar ponto: ${e.message}</span>`;
    }
};


function renderAutoRegisterPage() {
    const contentEl = document.getElementById('app-content');
    
    // Opções de Estado
    const estadoOptions = estados.map(e => `<option value="${e.uf}">${e.uf} - ${e.nome}</option>`).join('');

    contentEl.innerHTML = `
        <div class="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
            <div class="bg-white p-8 rounded-xl shadow-2xl w-full max-w-lg text-center border border-indigo-100">
                <img src="${configData.logo || 'https://placehold.co/150x50/334155/ffffff?text=RH'}" class="h-10 object-contain mx-auto mb-6" alt="Logo">
                <h2 class="text-2xl font-bold mb-2 text-slate-800">Autocadastro de Colaborador</h2>
                <p class="text-gray-600 mb-6">Preencha seus dados para iniciar o processo de contratação. O cargo será 'Novo (Aguardando)' até ser aprovado.</p>
                
                <form id="form-autocadastro" onsubmit="event.preventDefault(); submitAutoRegisterForm()">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                        
                        <div class="col-span-2">
                            <label class="block text-sm font-medium text-gray-700">Nome Completo</label>
                            <input type="text" id="a-nome" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" required>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700">CPF</label>
                            <input type="text" id="a-cpf" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" required>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">RG</label>
                            <input type="text" id="a-rg" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700">Data de Nascimento</label>
                            <input type="date" id="a-nasc" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" required>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">NIS/PIS</label>
                            <input type="text" id="a-pis" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
                        </div>

                        <div class="col-span-2">
                            <label class="block text-sm font-medium text-gray-700">Endereço Completo</label>
                            <input type="text" id="a-end" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" required>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700">Estado (UF)</label>
                            <select id="a-uf" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" required>
                                <option value="">Selecione...</option>
                                ${estadoOptions}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Município</label>
                            <input type="text" id="a-mun" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" required>
                        </div>

                    </div>
                    
                    <button type="submit" class="mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg focus:outline-none focus:shadow-outline transition duration-150 w-full">Enviar Cadastro para Análise</button>
                    <p id="autocadastro-message" class="text-sm text-center mt-4 hidden"></p>
                </form>
            </div>
        </div>
    `;
}

window.submitAutoRegisterForm = async () => {
    const el = document.getElementById('app-content');
    const messageEl = document.getElementById('autocadastro-message');
    messageEl.classList.remove('hidden', 'text-green-600', 'text-red-600');
    messageEl.classList.add('text-gray-600');
    messageEl.textContent = 'Enviando cadastro...';

    try {
        // Gera credenciais provisórias
        const genUser = 'temp' + Math.floor(Math.random() * 90000);
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
            jornadaHHMM: '08:00',
            createdAt: serverTimestamp()
        };
        
        await addDoc(getColl('employees'), data);
        
        el.innerHTML = `
            <div class="max-w-md mx-auto bg-white p-8 rounded-xl shadow-2xl text-center mt-20 border border-green-200">
                <i class="fa-solid fa-check-circle text-6xl text-green-500 mb-4"></i>
                <h2 class="text-2xl font-bold text-slate-800">Cadastro Realizado!</h2>
                <p class="text-gray-600 mt-2 mb-4">Seu cadastro foi enviado para análise. Anote suas credenciais provisórias para acessar o ponto após a aprovação:</p>
                <div class="bg-gray-100 p-4 rounded mt-4 font-mono text-lg border border-dashed border-gray-400">
                    <p>Usuário: <b>${genUser}</b></p>
                    <p>Senha: <b>${genPass}</b></p>
                </div>
                <p class="text-sm text-red-500 mt-3">É fundamental guardar essas credenciais!</p>
                <button onclick="router('ponto')" class="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-150">Ir para a página de Ponto</button>
            </div>
        `;

    } catch (e) {
        console.error("Erro no autocadastro: ", e);
        messageEl.textContent = `Erro ao enviar cadastro: ${e.message}`;
        messageEl.classList.remove('text-gray-600');
        messageEl.classList.add('text-red-600');
        messageEl.classList.remove('hidden');
    }
};


// --- FUNÇÕES DE MODAL CUSTOMIZADO (SUBSTITUI alert/confirm) ---

window.showCustomModal = (title, body, confirmText = null, onConfirm = null) => {
    const modal = document.getElementById('modal-overlay');
    const modalContent = document.getElementById('modal-content');
    
    let buttonsHtml = '';
    if (confirmText && onConfirm) {
        // Modal de Confirmação
        buttonsHtml = `
            <button onclick="hideModal()" class="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-150">Cancelar</button>
            <button id="modal-confirm-btn" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition duration-150">${confirmText}</button>
        `;
    } else {
        // Modal de Alerta
        buttonsHtml = `<button onclick="hideModal()" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition duration-150">OK</button>`;
    }

    modalContent.innerHTML = `
        <h3 class="text-xl font-bold mb-4">${title}</h3>
        <p class="text-gray-700 mb-6">${body}</p>
        <div class="flex justify-end gap-3">${buttonsHtml}</div>
    `;

    if (onConfirm) {
        document.getElementById('modal-confirm-btn').onclick = () => {
            onConfirm();
            hideModal(); // Fecha após a ação
        };
    }

    modal.classList.remove('hidden');
    document.getElementById('modal-content-container').classList.remove('hidden');
}

window.hideModal = () => {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('modal-content-container').classList.add('hidden');
    document.getElementById('modal-content').innerHTML = ''; // Limpa o conteúdo
}


// --- INICIALIZAÇÃO INICIAL APÓS CARREGAMENTO DO HTML ---
// O router inicial é chamado dentro do onAuthStateChanged.
// Garantimos que a função 'router' é acessível globalmente
window.router = router;
window.loadConfigAndRouter = loadConfigAndRouter;
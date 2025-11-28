import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, addDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// CONFIG
// *************************************************************************
// ** ATUALIZE AS CHAVES ABAIXO COM AS SUAS CREDENCIAIS REAIS DO FIREBASE **
// *************************************************************************
const firebaseConfig = {
  apiKey: "AIzaSyBLxhi9yn506R-kjlOoMz7R_i7C7c5iRjs",
  authDomain: "apprh-db10f.firebaseapp.com",
  projectId: "apprh-db10f",
  storageBucket: "apprh-db10f.firebasestorage.app",
  messagingSenderId: "1086403355974",
  appId: "1:1086403355974:web:9b31c7cc2f5d4411a27147",
  measurementId: "G-2L7PFCGDRM"
};
// *************************************************************************

const appId = typeof __app_id !== 'undefined' ? __app_id : 'rh-enterprise-v3';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const getColl = (collectionName) => {
    const userId = auth.currentUser?.uid || 'anonymous';
    // O sistema usa a estrutura privada /artifacts/{appId}/users/{userId}/{collectionName}
    // Para coleções que não dependem do usuário (como 'employees', 'config', 'logs'),
    // simplificamos para /artifacts/{appId}/public/data/{collectionName}
    // Embora o README indique /artifacts/{appId}/users/{userId}/...
    // Vamos usar a estrutura pública para dados globais/compartilhados:
    const path = `/artifacts/${appId}/public/data/${collectionName}`;
    return collection(db, path);
};


/**
 * Função principal de login do admin
 * @param {string} user
 * @param {string} pass
 */
async function login(user, pass) {
    const form = document.getElementById('form-login');
    const msg = document.getElementById('login-message');
    msg.textContent = '';
    const loginButton = document.querySelector('#form-login button[type="submit"]');

    if (loginButton) {
        loginButton.disabled = true;
        loginButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Entrando...`;
    }

    try {
        // 1. Tentar login admin/123456
        if (user === 'admin' && pass === '123456') {
            await signInAnonymously(auth);
            await setupAndGoToDashboard();
            return;
        }

        // 2. Tentar login de colaborador (se não for admin)
        const employeesRef = getColl('employees');
        const q = query(employeesRef, where('loginUser', '==', user), where('loginPass', '==', pass));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            msg.textContent = 'Usuário ou senha inválidos.';
            return;
        }

        const employeeDoc = querySnapshot.docs[0];
        const employeeData = employeeDoc.data();

        // Faz o login com a credencial específica do colaborador (poderia ser anônimo
        // ou criar um token customizado. Por simplicidade, vamos usar anônimo aqui)
        await signInAnonymously(auth);

        // Armazena o ID do funcionário logado no localStorage (não ideal, mas mantendo a lógica de SPA)
        localStorage.setItem('employeeId', employeeDoc.id);

        await setupAndGoToDashboard();

    } catch (error) {
        console.error("Erro no login:", error);
        msg.textContent = `Erro ao tentar conectar: ${error.message}`;
        if (loginButton) {
            loginButton.disabled = false;
            loginButton.innerHTML = `Entrar`;
        }
    } finally {
        if (loginButton) {
            loginButton.disabled = false;
            loginButton.innerHTML = `Entrar`;
        }
    }
}

/**
 * Funções de controle de UI
 */
const appContent = document.getElementById('app-content');

// Estado da aplicação (rotas)
let currentView = 'dashboard';
let isAuthenticated = false;
let globalConfig = {}; // Armazena a configuração geral (cargos, feriados, etc.)
let currentEmployeeId = null;

// Função para exibir modal customizado (em vez de alert/confirm)
function showModal(title, body, type = 'info', onConfirm = null, showCancel = false) {
    const modalOverlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalConfirmBtn = document.getElementById('modal-confirm');
    const modalCancelBtn = document.getElementById('modal-cancel');

    modalTitle.textContent = title;
    modalBody.innerHTML = body;

    // Configura o botão de confirmação
    modalConfirmBtn.onclick = () => {
        if (onConfirm) onConfirm();
        modalOverlay.classList.add('hidden');
    };

    // Configura o botão de cancelamento
    if (showCancel) {
        modalCancelBtn.classList.remove('hidden');
        modalCancelBtn.onclick = () => {
            modalOverlay.classList.add('hidden');
        };
    } else {
        modalCancelBtn.classList.add('hidden');
    }

    // Estiliza o botão de acordo com o tipo
    modalConfirmBtn.className = 'px-4 py-2 rounded font-semibold text-white transition-colors';
    if (type === 'error' || type === 'delete') {
        modalConfirmBtn.classList.add('bg-red-600', 'hover:bg-red-700');
    } else if (type === 'success') {
        modalConfirmBtn.classList.add('bg-green-600', 'hover:bg-green-700');
    } else { // info
        modalConfirmBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
    }

    modalOverlay.classList.remove('hidden');
}


function router(view) {
    currentView = view;
    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('bg-slate-700', 'text-white');
    });

    // Add active class to the selected nav item
    const activeItem = document.querySelector(`#sidebar button[onclick*="'${view}'"]`);
    if (activeItem) {
        activeItem.classList.add('bg-slate-700', 'text-white');
    }

    // Oculta o sidebar em mobile após o clique
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('absolute')) {
        sidebar.classList.add('hidden');
        sidebar.classList.remove('absolute', 'h-full');
    }

    renderView();
}

// ----------------------------------------------------
// RENDERIZAÇÃO DAS TELAS DA APLICAÇÃO (SPA)
// ----------------------------------------------------

async function renderView() {
    appContent.innerHTML = `<div class="flex justify-center mt-20"><div class="loader"></div></div>`;

    switch (currentView) {
        case 'dashboard':
            await renderDashboard();
            break;
        case 'employees':
            await renderEmployees();
            break;
        case 'config':
            await renderConfig();
            break;
        case 'reports':
            await renderReports();
            break;
        case 'links':
            await renderLinks();
            break;
        case 'employee-point': // Tela de ponto para colaboradores
            await renderEmployeePointScreen();
            break;
        case 'autocadastro': // Tela de auto cadastro público
            await renderAutocadastroScreen();
            break;
        default:
            appContent.innerHTML = `<div class="p-8 text-center text-red-500">Página não encontrada!</div>`;
    }
}

// ----------------------------------------------------
// DASHBOARD (Gestor)
// ----------------------------------------------------

async function renderDashboard() {
    try {
        const employeesColl = getColl('employees');
        const pointsColl = getColl('point_records');

        // Carregar número de colaboradores
        const employeesSnap = await getDocs(employeesColl);
        const numEmployees = employeesSnap.size;

        // Carregar pontos de hoje (simples)
        const today = new Date().toISOString().split('T')[0];
        const qToday = query(pointsColl, where('date', '==', today));
        const pointsTodaySnap = await getDocs(qToday);
        const numPointsToday = pointsTodaySnap.size;

        let totalPending = 0;
        let employeesData = [];

        employeesSnap.forEach(doc => {
            const data = doc.data();
            employeesData.push({ id: doc.id, ...data });

            // Simples: Conta como pendente se o cargo for 'Novo (Aguardando)'
            if (data.cargo === 'Novo (Aguardando)') {
                totalPending++;
            }
        });

        appContent.innerHTML = `
            <h1 class="text-3xl font-bold mb-6 text-slate-800">Dashboard de Gestão</h1>

            <!-- Widgets de Estatísticas -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <!-- Widget 1: Total de Colaboradores -->
                <div class="bg-white p-6 rounded-lg shadow-lg border-t-4 border-blue-500 hover:shadow-xl transition-shadow">
                    <div class="flex items-center">
                        <i class="fa-solid fa-users text-4xl text-blue-500 mr-4"></i>
                        <div>
                            <p class="text-sm font-medium text-gray-500">Colaboradores Cadastrados</p>
                            <p class="text-3xl font-bold text-gray-900">${numEmployees}</p>
                        </div>
                    </div>
                </div>

                <!-- Widget 2: Pontos Registrados Hoje -->
                <div class="bg-white p-6 rounded-lg shadow-lg border-t-4 border-green-500 hover:shadow-xl transition-shadow">
                    <div class="flex items-center">
                        <i class="fa-solid fa-clock text-4xl text-green-500 mr-4"></i>
                        <div>
                            <p class="text-sm font-medium text-gray-500">Pontos de Hoje</p>
                            <p class="text-3xl font-bold text-gray-900">${numPointsToday}</p>
                        </div>
                    </div>
                </div>

                <!-- Widget 3: Cadastros Pendentes -->
                <div class="bg-white p-6 rounded-lg shadow-lg border-t-4 border-yellow-500 hover:shadow-xl transition-shadow">
                    <div class="flex items-center">
                        <i class="fa-solid fa-exclamation-triangle text-4xl text-yellow-500 mr-4"></i>
                        <div>
                            <p class="text-sm font-medium text-gray-500">Cadastros Pendentes</p>
                            <p class="text-3xl font-bold text-gray-900">${totalPending}</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Colaboradores Recentes (ou Pendentes) -->
            <div class="bg-white p-6 rounded-lg shadow-lg">
                <h2 class="text-xl font-bold mb-4 text-slate-800">Colaboradores Recentes</h2>
                ${employeesData.length > 0 ? `
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cargo</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white divide-y divide-gray-200">
                                ${employeesData.slice(0, 5).map(emp => `
                                    <tr>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${emp.nomeCompleto}</td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${emp.cargo}</td>
                                        <td class="px-6 py-4 whitespace-nowrap">
                                            <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${emp.cargo === 'Novo (Aguardando)' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}">
                                                ${emp.cargo === 'Novo (Aguardando)' ? 'Pendente' : 'Ativo'}
                                            </span>
                                        </td>
                                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <button onclick="router('employees');" class="text-indigo-600 hover:text-indigo-900">Ver</button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="mt-4 text-center">
                        <button onclick="router('employees')" class="text-blue-600 hover:text-blue-800 font-semibold">Ver Todos os Colaboradores &rarr;</button>
                    </div>
                ` : '<p class="text-gray-500">Nenhum colaborador cadastrado ainda.</p>'}
            </div>
        `;
    } catch (e) {
        console.error("Erro ao renderizar Dashboard:", e);
        appContent.innerHTML = `<div class="p-8 text-center text-red-500">Erro ao carregar dados do Dashboard. Verifique a conexão com o Firebase e as regras de segurança.</div>`;
    }
}

// ----------------------------------------------------
// TELA DE COLABORADORES
// ----------------------------------------------------

async function renderEmployees() {
    try {
        const employeesColl = getColl('employees');
        const employeesSnap = await getDocs(employeesColl);
        let employees = employeesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Ordena para colocar pendentes no topo
        employees.sort((a, b) => {
            if (a.cargo === 'Novo (Aguardando)' && b.cargo !== 'Novo (Aguardando)') return -1;
            if (a.cargo !== 'Novo (Aguardando)' && b.cargo === 'Novo (Aguardando)') return 1;
            return a.nomeCompleto.localeCompare(b.nomeCompleto);
        });

        appContent.innerHTML = `
            <div class="flex justify-between items-center mb-6">
                <h1 class="text-3xl font-bold text-slate-800">Gestão de Colaboradores (${employees.length})</h1>
                <button onclick="showAddEditEmployeeModal()" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow transition-colors flex items-center gap-2 no-print">
                    <i class="fa-solid fa-user-plus"></i> Novo Colaborador
                </button>
            </div>

            <div class="bg-white p-6 rounded-lg shadow-lg">
                <input type="text" id="employee-search" onkeyup="filterEmployees()" placeholder="Buscar por nome, CPF ou cargo..." class="w-full p-3 mb-4 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500">

                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200" id="employees-table">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cargo</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Login</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200" id="employees-list">
                            ${renderEmployeeList(employees)}
                        </tbody>
                    </table>
                </div>
                ${employees.length === 0 ? '<p class="text-center py-8 text-gray-500" id="no-employees-message">Nenhum colaborador cadastrado.</p>' : ''}
            </div>
        `;

        window.employeesData = employees; // Armazena globalmente para busca
    } catch (e) {
        console.error("Erro ao renderizar a lista de Colaboradores:", e);
        appContent.innerHTML = `<div class="p-8 text-center text-red-500">Erro ao carregar lista de colaboradores. Verifique a conexão com o Firebase e as regras de segurança.</div>`;
    }
}

function renderEmployeeList(employees) {
    if (employees.length === 0) return '';
    return employees.map(emp => `
        <tr data-name="${emp.nomeCompleto}" data-cpf="${emp.cpf}" data-cargo="${emp.cargo}">
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                ${emp.nomeCompleto}
                ${emp.cargo === 'Novo (Aguardando)' ? '<span class="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Pendente</span>' : ''}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${emp.cargo}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <span class="font-mono text-xs bg-gray-100 p-1 rounded">${emp.loginUser || 'N/A'}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium flex gap-2">
                <button onclick="showAddEditEmployeeModal('${emp.id}')" class="text-indigo-600 hover:text-indigo-900 transition-colors" title="Editar"><i class="fa-solid fa-edit"></i></button>
                <button onclick="showEmployeeDetailsModal('${emp.id}')" class="text-blue-600 hover:text-blue-900 transition-colors" title="Detalhes"><i class="fa-solid fa-eye"></i></button>
                <button onclick="confirmDeleteEmployee('${emp.id}', '${emp.nomeCompleto}')" class="text-red-600 hover:text-red-900 transition-colors" title="Excluir"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

function filterEmployees() {
    const filter = document.getElementById('employee-search').value.toLowerCase();
    const list = document.getElementById('employees-list');
    const rows = list.querySelectorAll('tr');
    let visibleCount = 0;

    rows.forEach(row => {
        const name = row.getAttribute('data-name').toLowerCase();
        const cpf = row.getAttribute('data-cpf').toLowerCase();
        const cargo = row.getAttribute('data-cargo').toLowerCase();

        if (name.includes(filter) || cpf.includes(filter) || cargo.includes(filter)) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });

    const noEmployeesMsg = document.getElementById('no-employees-message');
    if (noEmployeesMsg) {
        noEmployeesMsg.style.display = visibleCount === 0 ? 'block' : 'none';
    }
}


async function showAddEditEmployeeModal(employeeId = null) {
    const isEdit = !!employeeId;
    let employee = {};
    const cargosHtml = globalConfig.cargos ? globalConfig.cargos.map(c => `<option value="${c.name}">${c.name}</option>`).join('') : '<option value="">(Cadastre cargos em Configurações)</option>';
    const estadosHtml = globalConfig.estados ? globalConfig.estados.map(e => `<option value="${e.uf}">${e.uf} - ${e.name}</option>`).join('') : '<option value="">(Cadastre estados em Configurações)</option>';
    let selectedUf = '';

    if (isEdit) {
        try {
            const docRef = doc(getColl('employees'), employeeId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                employee = docSnap.data();
                selectedUf = employee.estado ? employee.estado.split(' - ')[0] : '';
            } else {
                showModal('Erro', 'Colaborador não encontrado.', 'error');
                return;
            }
        } catch (e) {
            console.error("Erro ao carregar colaborador:", e);
            showModal('Erro', 'Não foi possível carregar os dados do colaborador.', 'error');
            return;
        }
    }

    // Modal Content
    const modalContent = `
        <form id="employee-form" class="space-y-4 p-2">
            <h3 class="text-xl font-bold mb-4">${isEdit ? 'Editar Colaborador' : 'Novo Colaborador'}</h3>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Nome Completo -->
                <div>
                    <label for="e-nome" class="block text-sm font-medium text-gray-700">Nome Completo <span class="text-red-500">*</span></label>
                    <input type="text" id="e-nome" value="${employee.nomeCompleto || ''}" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border focus:border-blue-500 focus:ring-blue-500">
                </div>
                <!-- CPF -->
                <div>
                    <label for="e-cpf" class="block text-sm font-medium text-gray-700">CPF <span class="text-red-500">*</span></label>
                    <input type="text" id="e-cpf" value="${employee.cpf || ''}" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border focus:border-blue-500 focus:ring-blue-500" pattern="[0-9]{11}" title="Apenas 11 dígitos numéricos">
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- RG -->
                <div>
                    <label for="e-rg" class="block text-sm font-medium text-gray-700">RG</label>
                    <input type="text" id="e-rg" value="${employee.rg || ''}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border focus:border-blue-500 focus:ring-blue-500">
                </div>
                <!-- Data Nascimento -->
                <div>
                    <label for="e-nasc" class="block text-sm font-medium text-gray-700">Data de Nasc.</label>
                    <input type="date" id="e-nasc" value="${employee.dataNascimento || ''}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border focus:border-blue-500 focus:ring-blue-500">
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- PIS/NIS -->
                <div>
                    <label for="e-pis" class="block text-sm font-medium text-gray-700">PIS/NIS</label>
                    <input type="text" id="e-pis" value="${employee.nisPIS || ''}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border focus:border-blue-500 focus:ring-blue-500">
                </div>
                <!-- Cargo -->
                <div>
                    <label for="e-cargo" class="block text-sm font-medium text-gray-700">Cargo <span class="text-red-500">*</span></label>
                    <select id="e-cargo" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border bg-white focus:border-blue-500 focus:ring-blue-500">
                        <option value="">Selecione um Cargo</option>
                        ${cargosHtml}
                    </select>
                </div>
            </div>

            <!-- Endereço -->
            <div>
                <label for="e-end" class="block text-sm font-medium text-gray-700">Endereço (Rua, Número, Bairro)</label>
                <input type="text" id="e-end" value="${employee.endereco || ''}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border focus:border-blue-500 focus:ring-blue-500">
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Estado (UF) -->
                <div>
                    <label for="e-uf" class="block text-sm font-medium text-gray-700">Estado (UF)</label>
                    <select id="e-uf" onchange="loadMunicipios(this.value, 'e-mun')" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border bg-white focus:border-blue-500 focus:ring-blue-500">
                        <option value="">Selecione a UF</option>
                        ${estadosHtml}
                    </select>
                </div>
                <!-- Município -->
                <div>
                    <label for="e-mun" class="block text-sm font-medium text-gray-700">Município</label>
                    <select id="e-mun" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border bg-white focus:border-blue-500 focus:ring-blue-500">
                        <option value="${employee.municipio || ''}">${employee.municipio || 'Selecione a UF Primeiro'}</option>
                    </select>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- Jornada HH:MM -->
                <div>
                    <label for="e-jornada" class="block text-sm font-medium text-gray-700">Jornada de Trabalho (HH:MM) <span class="text-red-500">*</span></label>
                    <input type="text" id="e-jornada" value="${employee.jornadaHHMM || '08:00'}" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border focus:border-blue-500 focus:ring-blue-500" pattern="[0-9]{2}:[0-9]{2}" title="Formato HH:MM, ex: 08:00">
                </div>
                <!-- Login/Senha -->
                <div>
                    <label class="block text-sm font-medium text-gray-700">Login/Senha ${isEdit ? '(Apenas visualização)' : '(Gerado Automaticamente)'}</label>
                    <div class="mt-1 flex gap-2">
                        <input type="text" id="e-login" value="${employee.loginUser || ''}" placeholder="Usuário" ${isEdit ? 'disabled' : ''} class="block w-1/2 rounded-md border-gray-300 shadow-sm p-2 border bg-gray-100 cursor-not-allowed">
                        <input type="text" id="e-pass" value="${employee.loginPass || ''}" placeholder="Senha" ${isEdit ? 'disabled' : ''} class="block w-1/2 rounded-md border-gray-300 shadow-sm p-2 border bg-gray-100 cursor-not-allowed">
                    </div>
                    ${isEdit ? '<p class="text-xs text-gray-500 mt-1">Para alterar, exclua e recadastre ou edite diretamente no Firestore.</p>' : ''}
                </div>
            </div>

            <div class="pt-4 flex justify-end gap-3 border-t">
                <button type="button" onclick="document.getElementById('modal-overlay').classList.add('hidden')" class="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors">
                    <i class="fa-solid fa-save"></i> ${isEdit ? 'Salvar Edições' : 'Cadastrar'}
                </button>
            </div>
        </form>
    `;

    showModal(isEdit ? 'Editar Colaborador' : 'Novo Colaborador', modalContent);

    // Pré-selecionar o cargo
    if (isEdit) {
        document.getElementById('e-cargo').value = employee.cargo || '';
    }

    // Carregar municípios se estiver editando
    if (isEdit && selectedUf) {
        await loadMunicipios(selectedUf, 'e-mun', employee.municipio);
    }

    // Adicionar listener de submit
    document.getElementById('employee-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveEmployee(employeeId, isEdit);
    });
}

function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

async function saveEmployee(employeeId, isEdit) {
    const saveButton = document.querySelector('#employee-form button[type="submit"]');
    saveButton.disabled = true;
    saveButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Salvando...`;

    try {
        const nomeCompleto = document.getElementById('e-nome').value;
        const cpf = document.getElementById('e-cpf').value;
        const cargo = document.getElementById('e-cargo').value;
        const jornadaHHMM = document.getElementById('e-jornada').value;

        if (!nomeCompleto || !cpf || !cargo || !jornadaHHMM) {
            showModal('Atenção', 'Campos obrigatórios (Nome, CPF, Cargo, Jornada) devem ser preenchidos.', 'error');
            return;
        }

        let loginUser = '';
        let loginPass = '';

        if (!isEdit) {
            // Gera novas credenciais apenas para novos cadastros
            const baseUser = nomeCompleto.toLowerCase().split(' ')[0] + cpf.slice(-4);
            loginUser = baseUser.replace(/[^a-z0-9]/g, ''); // Limpa o usuário
            loginPass = generateRandomString(6);
        } else {
            // Mantém as credenciais existentes (disabled no modal)
            loginUser = document.getElementById('e-login').value;
            loginPass = document.getElementById('e-pass').value;
        }


        const data = {
            nomeCompleto: nomeCompleto,
            cpf: cpf,
            rg: document.getElementById('e-rg').value,
            dataNascimento: document.getElementById('e-nasc').value,
            nisPIS: document.getElementById('e-pis').value,
            endereco: document.getElementById('e-end').value,
            estado: document.getElementById('e-uf').value,
            municipio: document.getElementById('e-mun').value,
            cargo: cargo,
            jornadaHHMM: jornadaHHMM,
            loginUser: loginUser,
            loginPass: loginPass,
            lastUpdate: serverTimestamp()
        };

        if (isEdit) {
            // Edição
            const docRef = doc(getColl('employees'), employeeId);
            await updateDoc(docRef, data);
            showModal('Sucesso', 'Colaborador atualizado com sucesso!', 'success');
        } else {
            // Novo cadastro
            data.createdAt = serverTimestamp();
            await addDoc(getColl('employees'), data);
            showModal('Sucesso', `Colaborador **${nomeCompleto}** cadastrado! <br><br> Credenciais de Acesso: <br> Usuário: **${loginUser}** <br> Senha: **${loginPass}**`, 'success');
        }

        // Fecha o modal e recarrega a lista
        document.getElementById('modal-overlay').classList.add('hidden');
        await renderEmployees();

    } catch (e) {
        console.error("Erro ao salvar colaborador:", e);
        showModal('Erro', `Não foi possível salvar os dados do colaborador: ${e.message}`, 'error');
    } finally {
        saveButton.disabled = false;
        saveButton.innerHTML = `<i class="fa-solid fa-save"></i> ${isEdit ? 'Salvar Edições' : 'Cadastrar'}`;
    }
}

async function showEmployeeDetailsModal(employeeId) {
    try {
        const docRef = doc(getColl('employees'), employeeId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            showModal('Erro', 'Colaborador não encontrado.', 'error');
            return;
        }

        const employee = docSnap.data();

        const detailsHtml = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <!-- Coluna 1 -->
                <div class="space-y-2">
                    <p><strong>Nome:</strong> ${employee.nomeCompleto}</p>
                    <p><strong>Cargo:</strong> ${employee.cargo}</p>
                    <p><strong>Jornada:</strong> ${employee.jornadaHHMM}</p>
                    <p><strong>Login:</strong> <span class="font-mono bg-gray-100 p-1 rounded text-xs">${employee.loginUser || 'N/A'}</span></p>
                    <p><strong>Senha:</strong> <span class="font-mono bg-gray-100 p-1 rounded text-xs">${employee.loginPass || 'N/A'}</span></p>
                </div>
                <!-- Coluna 2 -->
                <div class="space-y-2">
                    <p><strong>CPF:</strong> ${employee.cpf || 'N/A'}</p>
                    <p><strong>RG:</strong> ${employee.rg || 'N/A'}</p>
                    <p><strong>PIS/NIS:</strong> ${employee.nisPIS || 'N/A'}</p>
                    <p><strong>Nascimento:</strong> ${employee.dataNascimento || 'N/A'}</p>
                    <p><strong>Endereço:</strong> ${employee.endereco || 'N/A'}</p>
                    <p><strong>Local:</strong> ${employee.municipio || 'N/A'} - ${employee.estado ? employee.estado.split(' - ')[0] : 'N/A'}</p>
                </div>
            </div>
            <div class="mt-6 flex justify-end gap-3 border-t pt-4">
                <button onclick="showAddEditEmployeeModal('${employeeId}')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors"><i class="fa-solid fa-edit"></i> Editar</button>
                <button onclick="confirmDeleteEmployee('${employeeId}', '${employee.nomeCompleto}')" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors"><i class="fa-solid fa-trash"></i> Excluir</button>
            </div>
        `;

        showModal('Detalhes do Colaborador', detailsHtml, 'info');

    } catch (e) {
        console.error("Erro ao exibir detalhes:", e);
        showModal('Erro', 'Não foi possível carregar os detalhes do colaborador.', 'error');
    }
}

function confirmDeleteEmployee(employeeId, employeeName) {
    showModal('Confirmação de Exclusão',
        `<p>Você tem certeza que deseja **excluir permanentemente** o colaborador **${employeeName}**?</p><p class="text-red-600 font-bold mt-2">Esta ação é irreversível.</p>`,
        'delete',
        async () => {
            await deleteEmployee(employeeId);
        },
        true // Mostrar botão Cancelar
    );
}

async function deleteEmployee(employeeId) {
    try {
        const docRef = doc(getColl('employees'), employeeId);
        await deleteDoc(docRef);
        showModal('Sucesso', 'Colaborador excluído com sucesso!', 'success');
        await renderEmployees(); // Recarrega a lista
    } catch (e) {
        console.error("Erro ao excluir colaborador:", e);
        showModal('Erro', 'Não foi possível excluir o colaborador.', 'error');
    }
}


// ----------------------------------------------------
// TELA DE CONFIGURAÇÕES (Estrutura: Cargos, Estados, Redes, Feriados)
// ----------------------------------------------------

async function renderConfig() {
    try {
        await loadGlobalConfig(); // Garante que a config está atualizada

        appContent.innerHTML = `
            <h1 class="text-3xl font-bold mb-6 text-slate-800">Configurações de Estrutura</h1>
            <div class="space-y-8">
                ${renderConfigSection('Cargos', 'cargos', 'fa-briefcase', 'Nome do Cargo (ex: Promotor Fixo)')}
                ${renderConfigSection('Estados Atendidos', 'estados', 'fa-globe', 'UF - Nome do Estado (ex: SP - São Paulo)')}
                ${renderConfigSection('Redes e Lojas', 'redesLojas', 'fa-store', 'Nome da Rede ou Loja (ex: Supermercado X)')}
                ${renderConfigSection('Feriados', 'feriados', 'fa-calendar-alt', 'Data e Nome (ex: 25/12 - Natal)', 'date')}
            </div>
        `;

        // Atribui listeners após a renderização
        document.querySelectorAll('.add-config-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                showAddConfigModal(type);
            });
        });

    } catch (e) {
        console.error("Erro ao renderizar Configurações:", e);
        appContent.innerHTML = `<div class="p-8 text-center text-red-500">Erro ao carregar Configurações. Verifique a conexão com o Firebase e as regras de segurança.</div>`;
    }
}

function renderConfigSection(title, type, icon, placeholder, valueType = 'text') {
    const list = globalConfig[type] || [];
    return `
        <div class="bg-white p-6 rounded-lg shadow-lg border-t-4 border-indigo-500">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-bold text-slate-800 flex items-center gap-3">
                    <i class="fa-solid ${icon} text-indigo-500"></i> ${title} (${list.length})
                </h2>
                <button data-type="${type}" class="add-config-btn bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow transition-colors text-sm">
                    <i class="fa-solid fa-plus"></i> Adicionar
                </button>
            </div>

            <div class="space-y-3">
                ${list.length > 0 ? list.map((item, index) => `
                    <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg border">
                        <span class="text-gray-700">${item.name || item.date}</span>
                        <div class="flex gap-2">
                            <button onclick="showEditConfigModal('${type}', ${index})" class="text-blue-600 hover:text-blue-800 transition-colors" title="Editar"><i class="fa-solid fa-edit"></i></button>
                            <button onclick="confirmDeleteConfig('${type}', ${index}, '${item.name || item.date}')" class="text-red-600 hover:text-red-800 transition-colors" title="Excluir"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                `).join('') : `<p class="text-gray-500">Nenhum item cadastrado para ${title}.</p>`}
            </div>
        </div>
    `;
}

// ----------------------------------------------------
// GERENCIAMENTO DE DADOS DE CONFIGURAÇÃO (Global)
// ----------------------------------------------------

async function loadGlobalConfig() {
    try {
        const docRef = doc(db, `/artifacts/${appId}/public/data/config/global`);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            globalConfig = docSnap.data();
        } else {
            globalConfig = {};
        }

    } catch (e) {
        console.error("Erro ao carregar configuração global:", e);
        // Não mostrar modal, apenas logar, pois a ausência é esperada no primeiro acesso.
    }
}

async function saveGlobalConfig(configData) {
    try {
        const docRef = doc(db, `/artifacts/${appId}/public/data/config/global`);
        await setDoc(docRef, configData, { merge: true });
        globalConfig = configData; // Atualiza o estado local
        return true;
    } catch (e) {
        console.error("Erro ao salvar configuração global:", e);
        showModal('Erro', 'Não foi possível salvar a configuração no Firebase.', 'error');
        return false;
    }
}

function showAddConfigModal(type) {
    let title = '';
    let label = '';
    let inputType = 'text';

    switch (type) {
        case 'cargos':
            title = 'Adicionar Novo Cargo';
            label = 'Nome do Cargo:';
            break;
        case 'estados':
            title = 'Adicionar Novo Estado (UF - Nome)';
            label = 'Estado (ex: SP - São Paulo):';
            break;
        case 'redesLojas':
            title = 'Adicionar Nova Rede/Loja';
            label = 'Nome da Rede/Loja:';
            break;
        case 'feriados':
            title = 'Adicionar Feriado';
            label = 'Data do Feriado:';
            inputType = 'date';
            break;
    }

    const modalContent = `
        <form id="config-form" data-type="${type}" class="space-y-4 p-2">
            <div>
                <label for="config-value" class="block text-sm font-medium text-gray-700">${label}</label>
                <input type="${inputType}" id="config-value" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border focus:border-indigo-500 focus:ring-indigo-500">
            </div>
            ${type === 'feriados' ? `
            <div>
                <label for="config-name" class="block text-sm font-medium text-gray-700">Nome do Feriado:</label>
                <input type="text" id="config-name" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border focus:border-indigo-500 focus:ring-indigo-500">
            </div>
            ` : ''}

            <div class="pt-4 flex justify-end gap-3 border-t">
                <button type="button" onclick="document.getElementById('modal-overlay').classList.add('hidden')" class="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors">
                    <i class="fa-solid fa-plus"></i> Adicionar
                </button>
            </div>
        </form>
    `;

    showModal(title, modalContent);

    document.getElementById('config-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const value = document.getElementById('config-value').value.trim();
        let name = type === 'feriados' ? document.getElementById('config-name').value.trim() : value;

        if (type === 'estados') {
            const parts = value.split(' - ').map(p => p.trim());
            if (parts.length < 2 || parts[0].length !== 2) {
                showModal('Erro', 'Formato incorreto. Use: UF - Nome do Estado (ex: SP - São Paulo).', 'error');
                return;
            }
            name = parts[1];
        }

        if (value) {
            let newItem = {};
            if (type === 'feriados') {
                newItem = { date: value, name: name };
            } else if (type === 'estados') {
                newItem = { uf: value.split(' - ')[0].toUpperCase(), name: name };
            } else {
                newItem = { name: value };
            }

            const currentList = globalConfig[type] || [];
            if (currentList.some(item => (item.name || item.date) === (newItem.name || newItem.date))) {
                showModal('Atenção', `O item "${name || value}" já existe.`, 'info');
                return;
            }

            currentList.push(newItem);
            const success = await saveGlobalConfig({ ...globalConfig, [type]: currentList });

            if (success) {
                document.getElementById('modal-overlay').classList.add('hidden');
                await renderConfig();
            }
        }
    });
}


function showEditConfigModal(type, index) {
    let list = globalConfig[type] || [];
    let item = list[index];

    if (!item) {
        showModal('Erro', 'Item de configuração não encontrado.', 'error');
        return;
    }

    let title = '';
    let label = '';
    let value = '';
    let inputType = 'text';

    switch (type) {
        case 'cargos':
            title = 'Editar Cargo';
            label = 'Nome do Cargo:';
            value = item.name;
            break;
        case 'estados':
            title = 'Editar Estado (UF - Nome)';
            label = 'Estado (ex: SP - São Paulo):';
            value = `${item.uf} - ${item.name}`;
            break;
        case 'redesLojas':
            title = 'Editar Rede/Loja';
            label = 'Nome da Rede/Loja:';
            value = item.name;
            break;
        case 'feriados':
            title = 'Editar Feriado';
            label = 'Data do Feriado:';
            inputType = 'date';
            value = item.date;
            break;
    }

    const modalContent = `
        <form id="config-form-edit" data-type="${type}" data-index="${index}" class="space-y-4 p-2">
            <div>
                <label for="config-value-edit" class="block text-sm font-medium text-gray-700">${label}</label>
                <input type="${inputType}" id="config-value-edit" value="${value}" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border focus:border-indigo-500 focus:ring-indigo-500">
            </div>
            ${type === 'feriados' ? `
            <div>
                <label for="config-name-edit" class="block text-sm font-medium text-gray-700">Nome do Feriado:</label>
                <input type="text" id="config-name-edit" value="${item.name}" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border focus:border-indigo-500 focus:ring-indigo-500">
            </div>
            ` : ''}

            <div class="pt-4 flex justify-end gap-3 border-t">
                <button type="button" onclick="document.getElementById('modal-overlay').classList.add('hidden')" class="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition-colors">Cancelar</button>
                <button type="submit" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors">
                    <i class="fa-solid fa-save"></i> Salvar
                </button>
            </div>
        </form>
    `;

    showModal(title, modalContent);

    document.getElementById('config-form-edit').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newValue = document.getElementById('config-value-edit').value.trim();
        const newName = type === 'feriados' ? document.getElementById('config-name-edit').value.trim() : newValue;

        if (newValue) {
            let updatedItem = {};
            if (type === 'feriados') {
                updatedItem = { date: newValue, name: newName };
            } else if (type === 'estados') {
                const parts = newValue.split(' - ').map(p => p.trim());
                if (parts.length < 2 || parts[0].length !== 2) {
                    showModal('Erro', 'Formato incorreto. Use: UF - Nome do Estado (ex: SP - São Paulo).', 'error');
                    return;
                }
                updatedItem = { uf: parts[0].toUpperCase(), name: parts[1] };
            } else {
                updatedItem = { name: newValue };
            }

            let newList = [...list];
            // Verifica duplicidade, excluindo o item atual
            const isDuplicate = newList.some((i, idx) => idx !== index && (i.name || i.date) === (updatedItem.name || updatedItem.date));

            if (isDuplicate) {
                showModal('Atenção', `O item "${newName || newValue}" já existe.`, 'info');
                return;
            }

            newList[index] = updatedItem;

            const success = await saveGlobalConfig({ ...globalConfig, [type]: newList });

            if (success) {
                document.getElementById('modal-overlay').classList.add('hidden');
                await renderConfig();
            }
        }
    });
}

function confirmDeleteConfig(type, index, itemName) {
    showModal('Confirmação de Exclusão',
        `<p>Você tem certeza que deseja excluir "**${itemName}**" da lista de ${type}?</p>`,
        'delete',
        async () => {
            let list = globalConfig[type] || [];
            list.splice(index, 1);

            const success = await saveGlobalConfig({ ...globalConfig, [type]: list });
            if (success) {
                document.getElementById('modal-overlay').classList.add('hidden');
                await renderConfig();
            }
        },
        true // Mostrar botão Cancelar
    );
}

// ----------------------------------------------------
// TELA DE RELATÓRIOS (Simples)
// ----------------------------------------------------

async function renderReports() {
    // Busca todos os registros de ponto e colaboradores
    try {
        const pointsSnap = await getDocs(getColl('point_records'));
        const employeesSnap = await getDocs(getColl('employees'));

        const points = pointsSnap.docs.map(doc => doc.data());
        const employeesMap = employeesSnap.docs.reduce((acc, doc) => {
            acc[doc.id] = doc.data();
            return acc;
        }, {});

        // Processamento básico para o relatório
        const reportData = points.reduce((acc, record) => {
            const employee = employeesMap[record.employeeId];
            if (!employee) return acc;

            const key = record.date; // Agrupa por dia
            if (!acc[key]) {
                acc[key] = {
                    date: key,
                    totalPoints: 0,
                    employees: new Set()
                };
            }
            acc[key].totalPoints++;
            acc[key].employees.add(employee.nomeCompleto);
            return acc;
        }, {});

        const sortedReport = Object.values(reportData).sort((a, b) => new Date(b.date) - new Date(a.date));

        appContent.innerHTML = `
            <div class="flex justify-between items-center mb-6">
                <h1 class="text-3xl font-bold text-slate-800">Relatórios de Ponto</h1>
                <button onclick="window.print()" class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg shadow transition-colors text-sm no-print">
                    <i class="fa-solid fa-print"></i> Imprimir
                </button>
            </div>

            <div class="bg-white p-6 rounded-lg shadow-lg">
                <h2 class="text-xl font-bold mb-4 text-slate-800">Resumo Diário de Registros</h2>

                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total de Registros</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Colaboradores c/ Ponto</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detalhes (Simulado)</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${sortedReport.map(item => `
                                <tr>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${formatDateBR(item.date)}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.totalPoints}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.employees.size}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <button onclick="showDailyReportDetails('${item.date}')" class="text-indigo-600 hover:text-indigo-900 transition-colors" title="Ver Detalhes"><i class="fa-solid fa-file-alt"></i> Ver</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ${sortedReport.length === 0 ? '<p class="text-center py-8 text-gray-500">Nenhum registro de ponto encontrado.</p>' : ''}
            </div>
        `;
    } catch (e) {
        console.error("Erro ao renderizar Relatórios:", e);
        appContent.innerHTML = `<div class="p-8 text-center text-red-500">Erro ao carregar Relatórios. Verifique a conexão com o Firebase e as regras de segurança.</div>`;
    }
}

async function showDailyReportDetails(date) {
    try {
        const pointsColl = getColl('point_records');
        const employeesColl = getColl('employees');

        const q = query(pointsColl, where('date', '==', date));
        const pointsSnap = await getDocs(q);
        const points = pointsSnap.docs.map(doc => doc.data());

        const employeeIds = [...new Set(points.map(p => p.employeeId))];
        const employeesMap = {};
        for (const id of employeeIds) {
            const docSnap = await getDoc(doc(employeesColl, id));
            if (docSnap.exists()) {
                employeesMap[id] = docSnap.data();
            }
        }

        // Agrupa registros por colaborador
        const employeePoints = points.reduce((acc, p) => {
            if (!acc[p.employeeId]) {
                acc[p.employeeId] = {
                    name: employeesMap[p.employeeId]?.nomeCompleto || 'Colaborador Desconhecido',
                    records: []
                };
            }
            acc[p.employeeId].records.push(p);
            return acc;
        }, {});

        // Ordena os registros de cada colaborador por timestamp
        Object.values(employeePoints).forEach(emp => {
            emp.records.sort((a, b) => (a.timestamp.seconds || a.timestamp) - (b.timestamp.seconds || b.timestamp));
        });

        const detailsHtml = `
            <h3 class="text-xl font-bold mb-4">Registros de Ponto - ${formatDateBR(date)}</h3>
            <div class="space-y-6 max-h-96 overflow-y-auto p-2">
                ${Object.values(employeePoints).map(emp => `
                    <div class="border p-4 rounded-lg bg-gray-50">
                        <p class="font-semibold text-lg text-slate-800">${emp.name}</p>
                        <ul class="mt-2 space-y-1">
                            ${emp.records.map(r => `
                                <li class="text-sm flex justify-between items-center border-b pb-1 last:border-b-0">
                                    <span><i class="fa-solid fa-clock text-blue-500 mr-2"></i> ${r.time}</span>
                                    <span class="text-xs text-gray-500">(${r.location || 'Local Não Informado'})</span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                `).join('')}
            </div>
            <div class="mt-6 flex justify-end gap-3 border-t pt-4">
                <button onclick="document.getElementById('modal-overlay').classList.add('hidden')" class="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition-colors">Fechar</button>
            </div>
        `;

        showModal('Detalhes do Relatório Diário', detailsHtml, 'info');

    } catch (e) {
        console.error("Erro ao mostrar detalhes do relatório:", e);
        showModal('Erro', 'Não foi possível carregar os detalhes do relatório.', 'error');
    }
}


// ----------------------------------------------------
// TELA DE LINKS DE ACESSO
// ----------------------------------------------------

async function renderLinks() {
    const pontoLink = window.location.origin + window.location.pathname + '?view=point';
    const autocadastroLink = window.location.origin + window.location.pathname + '?view=autocadastro';

    appContent.innerHTML = `
        <h1 class="text-3xl font-bold mb-6 text-slate-800">Links de Acesso Público</h1>
        <p class="text-gray-600 mb-8">Utilize estes links para que os colaboradores possam bater ponto e realizar o autocadastro, sem a necessidade de acessar o painel de gestão.</p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <!-- Link do Ponto -->
            <div class="bg-white p-6 rounded-lg shadow-lg border-l-4 border-blue-500">
                <h2 class="text-xl font-bold mb-3 text-slate-800 flex items-center gap-2">
                    <i class="fa-solid fa-clock-rotate-left text-blue-500"></i> Link de Batida de Ponto
                </h2>
                <p class="text-gray-600 mb-3">Página onde o colaborador entra com seu login e senha para registrar o ponto.</p>
                <div class="bg-gray-100 p-3 rounded-lg border border-dashed border-gray-300 flex items-center justify-between gap-3">
                    <span id="ponto-link-display" class="text-sm font-mono text-gray-700 break-all">${pontoLink}</span>
                    <button onclick="copyToClipboard('ponto-link-display')" class="text-blue-600 hover:text-blue-800 transition-colors" title="Copiar Link">
                        <i class="fa-solid fa-copy"></i>
                    </button>
                </div>
            </div>

            <!-- Link de Autocadastro -->
            <div class="bg-white p-6 rounded-lg shadow-lg border-l-4 border-green-500">
                <h2 class="text-xl font-bold mb-3 text-slate-800 flex items-center gap-2">
                    <i class="fa-solid fa-user-plus text-green-500"></i> Link de Autocadastro
                </h2>
                <p class="text-gray-600 mb-3">Página para que novos colaboradores possam preencher seus dados iniciais.</p>
                <div class="bg-gray-100 p-3 rounded-lg border border-dashed border-gray-300 flex items-center justify-between gap-3">
                    <span id="autocadastro-link-display" class="text-sm font-mono text-gray-700 break-all">${autocadastroLink}</span>
                    <button onclick="copyToClipboard('autocadastro-link-display')" class="text-green-600 hover:text-green-800 transition-colors" title="Copiar Link">
                        <i class="fa-solid fa-copy"></i>
                    </button>
                </div>
            </div>
        </div>

        <div class="mt-8 p-6 bg-yellow-50 rounded-lg border border-yellow-200">
            <h3 class="text-lg font-bold text-yellow-800 flex items-center gap-2"><i class="fa-solid fa-exclamation-triangle"></i> Atenção</h3>
            <p class="text-yellow-700 mt-2">Certifique-se de que o Firebase Firestore está configurado no modo de teste para permitir acesso público a esses links, conforme indicado no README.</p>
        </div>
    `;
}

function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    const text = element.textContent || element.innerText;
    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showModal('Copiado!', 'O link foi copiado para a área de transferência.', 'success');
    } catch (err) {
        console.error('Falha ao copiar:', err);
        showModal('Erro', 'Não foi possível copiar o texto automaticamente.', 'error');
    }
}

// ----------------------------------------------------
// TELA DE BATIDA DE PONTO (Colaborador)
// ----------------------------------------------------

async function renderEmployeePointScreen() {
    // Verifica se o colaborador já está logado na sessão (via localStorage)
    currentEmployeeId = localStorage.getItem('employeeId');

    if (currentEmployeeId) {
        await renderPointClock(currentEmployeeId);
    } else {
        renderPointLogin();
    }
}

function renderPointLogin() {
    appContent.innerHTML = `
        <div class="flex flex-col justify-center items-center p-4">
            <div class="bg-white text-gray-800 p-8 rounded-lg shadow-2xl w-full max-w-md mt-10">
                <h2 class="text-2xl font-bold text-center mb-6 text-slate-800">Bater Ponto</h2>
                <form id="form-point-login" class="space-y-4">
                    <div>
                        <label for="p-user" class="block text-sm font-medium text-gray-700">Usuário:</label>
                        <input type="text" id="p-user" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-3 border focus:border-blue-500 focus:ring-blue-500" placeholder="Seu usuário de ponto">
                    </div>
                    <div>
                        <label for="p-pass" class="block text-sm font-medium text-gray-700">Senha:</label>
                        <input type="password" id="p-pass" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-3 border focus:border-blue-500 focus:ring-blue-500" placeholder="Sua senha">
                    </div>

                    <p id="point-login-message" class="text-sm text-red-500 text-center"></p>

                    <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg shadow-md transition-colors">
                        Entrar e Bater Ponto
                    </button>
                </form>
            </div>
        </div>
    `;

    document.getElementById('form-point-login').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = document.getElementById('p-user').value;
        const pass = document.getElementById('p-pass').value;
        await pointLogin(user, pass);
    });
}

async function pointLogin(user, pass) {
    const msg = document.getElementById('point-login-message');
    const loginButton = document.querySelector('#form-point-login button[type="submit"]');
    msg.textContent = '';

    if (loginButton) {
        loginButton.disabled = true;
        loginButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Entrando...`;
    }

    try {
        // 1. Tenta encontrar o colaborador
        const employeesRef = getColl('employees');
        const q = query(employeesRef, where('loginUser', '==', user), where('loginPass', '==', pass));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            msg.textContent = 'Usuário ou senha inválidos.';
            return;
        }

        const employeeDoc = querySnapshot.docs[0];
        currentEmployeeId = employeeDoc.id;

        // 2. Armazena o ID do funcionário logado
        localStorage.setItem('employeeId', currentEmployeeId);

        // 3. Renderiza a tela de relógio
        await renderPointClock(currentEmployeeId);

    } catch (error) {
        console.error("Erro no login de ponto:", error);
        msg.textContent = `Erro ao tentar conectar: ${error.message}`;
    } finally {
        if (loginButton) {
            loginButton.disabled = false;
            loginButton.innerHTML = `Entrar e Bater Ponto`;
        }
    }
}

async function renderPointClock(employeeId) {
    let employeeData = {};
    let employeeName = 'Colaborador';
    let todayRecords = [];
    let isLocationAvailable = 'Determining...';
    let locationData = {};

    try {
        // 1. Buscar dados do colaborador
        const docSnap = await getDoc(doc(getColl('employees'), employeeId));
        if (docSnap.exists()) {
            employeeData = docSnap.data();
            employeeName = employeeData.nomeCompleto;
        } else {
            showModal('Erro', 'Colaborador não encontrado. Faça login novamente.', 'error', () => {
                pointLogout();
            });
            return;
        }

        // 2. Buscar registros de ponto de hoje
        const today = new Date().toISOString().split('T')[0];
        const q = query(getColl('point_records'), where('employeeId', '==', employeeId), where('date', '==', today));
        const recordsSnap = await getDocs(q);
        todayRecords = recordsSnap.docs.map(doc => doc.data()).sort((a, b) => (a.timestamp.seconds || a.timestamp) - (b.timestamp.seconds || b.timestamp));

        // 3. Obter localização
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    isLocationAvailable = 'A localização foi registrada.';
                    locationData = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: new Date().toISOString()
                    };
                    document.getElementById('location-status').textContent = isLocationAvailable;
                    document.getElementById('location-status').classList.remove('text-yellow-600');
                    document.getElementById('location-status').classList.add('text-green-600');
                    document.getElementById('point-button').disabled = false;
                    window.pointLocationData = locationData; // Salva para uso na batida
                },
                (error) => {
                    console.error("Erro de geolocalização:", error);
                    isLocationAvailable = 'Localização indisponível. O ponto será registrado sem coordenadas GPS.';
                    document.getElementById('location-status').textContent = isLocationAvailable;
                    document.getElementById('location-status').classList.remove('text-yellow-600');
                    document.getElementById('location-status').classList.add('text-red-600');
                    document.getElementById('point-button').disabled = false;
                    window.pointLocationData = {};
                },
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
        } else {
            isLocationAvailable = 'Geolocalização não suportada pelo seu navegador. O ponto será registrado sem coordenadas GPS.';
            document.getElementById('location-status').textContent = isLocationAvailable;
            document.getElementById('location-status').classList.remove('text-yellow-600');
            document.getElementById('location-status').classList.add('text-red-600');
            document.getElementById('point-button').disabled = false;
            window.pointLocationData = {};
        }

    } catch (e) {
        console.error("Erro ao carregar relógio de ponto:", e);
        showModal('Erro', 'Não foi possível carregar os dados do colaborador. Tente novamente.', 'error', () => {
            pointLogout();
        });
        return;
    }

    appContent.innerHTML = `
        <div class="flex flex-col justify-center items-center p-4">
            <div class="bg-white text-gray-800 p-8 rounded-lg shadow-2xl w-full max-w-md mt-10 space-y-6">
                <div class="text-center">
                    <h2 class="text-xl font-semibold text-slate-800">Bem-vindo(a),</h2>
                    <p class="text-3xl font-bold text-blue-600">${employeeName}</p>
                    <p class="text-sm text-gray-500 mt-1">Cargo: ${employeeData.cargo}</p>
                </div>

                <!-- Relógio Digital -->
                <div class="text-center">
                    <div id="point-clock" class="text-6xl font-extrabold text-slate-900 mb-2">--:--:--</div>
                    <div id="point-date" class="text-lg font-medium text-gray-600">${formatDateBR(new Date().toISOString().split('T')[0])}</div>
                </div>

                <!-- Botão de Bater Ponto -->
                <button id="point-button" onclick="recordPoint('${employeeId}')" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-4 rounded-lg shadow-lg transition-colors text-xl disabled:bg-gray-400 disabled:cursor-not-allowed" disabled>
                    <i class="fa-solid fa-check-circle"></i> BATER PONTO
                </button>

                <!-- Status da Localização -->
                <div class="text-center p-3 bg-gray-50 rounded-lg border">
                    <p id="location-status" class="text-sm font-medium text-yellow-600">
                        <i class="fa-solid fa-location-dot mr-1"></i> Aguardando localização...
                    </p>
                </div>

                <!-- Registros de Hoje -->
                <div>
                    <h3 class="text-lg font-semibold mb-3 border-b pb-1 text-slate-800">Registros de Hoje (${todayRecords.length})</h3>
                    <ul id="today-records-list" class="space-y-2 max-h-40 overflow-y-auto">
                        ${todayRecords.length > 0 ? todayRecords.map(r => `
                            <li class="flex justify-between items-center text-gray-700 text-sm bg-blue-50 p-2 rounded-md">
                                <span><i class="fa-solid fa-arrow-right-to-bracket mr-2"></i> ${r.time}</span>
                                <span class="text-xs text-blue-700 font-medium">${r.location || 'Local Não Registrado'}</span>
                            </li>
                        `).join('') : '<p class="text-sm text-gray-500 text-center">Nenhum ponto registrado hoje.</p>'}
                    </ul>
                </div>

                <!-- Logout -->
                <div class="pt-4 border-t">
                    <button onclick="pointLogout()" class="w-full text-red-500 hover:text-red-700 transition-colors font-medium">
                        <i class="fa-solid fa-power-off mr-2"></i> Sair do Ponto
                    </button>
                </div>
            </div>
        </div>
    `;

    // Inicia o relógio
    updatePointClock();
    window.pointClockInterval = setInterval(updatePointClock, 1000);
    window.updateTodayRecords = () => updateRecordsList(todayRecords); // Função para atualizar a lista após batida
}

function updatePointClock() {
    const clockElement = document.getElementById('point-clock');
    if (clockElement) {
        const now = new Date();
        const timeString = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        clockElement.textContent = timeString;
    } else {
        clearInterval(window.pointClockInterval);
    }
}

async function recordPoint(employeeId) {
    const pointButton = document.getElementById('point-button');
    pointButton.disabled = true;
    pointButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Registrando...`;

    try {
        const now = new Date();
        const date = now.toISOString().split('T')[0];
        const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        const locationData = window.pointLocationData || {};
        let location = '';
        if (locationData.latitude) {
            location = `Lat: ${locationData.latitude.toFixed(4)}, Lon: ${locationData.longitude.toFixed(4)}`;
        } else {
            location = 'Sem GPS';
        }

        const newRecord = {
            employeeId: employeeId,
            date: date,
            time: time,
            timestamp: now.getTime(), // Usamos timestamp numérico para facilitar ordenação
            location: location,
            locationDetails: JSON.stringify(locationData), // Salva detalhes completos em JSON string
            createdAt: serverTimestamp()
        };

        await addDoc(getColl('point_records'), newRecord);

        // Atualiza a lista de registros de hoje
        const recordsSnap = await getDocs(query(getColl('point_records'), where('employeeId', '==', employeeId), where('date', '==', date)));
        const updatedRecords = recordsSnap.docs.map(doc => doc.data()).sort((a, b) => (a.timestamp.seconds || a.timestamp) - (b.timestamp.seconds || b.timestamp));
        updateRecordsList(updatedRecords);


        showModal('Sucesso!', `Ponto registrado às ${time}.`, 'success');

    } catch (e) {
        console.error("Erro ao registrar ponto:", e);
        showModal('Erro', `Não foi possível registrar o ponto: ${e.message}`, 'error');
    } finally {
        pointButton.disabled = false;
        pointButton.innerHTML = `<i class="fa-solid fa-check-circle"></i> BATER PONTO`;
        // Força a re-obtenção da localização após a batida para garantir dados frescos.
        if (navigator.geolocation && document.getElementById('location-status')) {
            document.getElementById('location-status').textContent = 'Aguardando localização...';
            document.getElementById('location-status').classList.remove('text-green-600', 'text-red-600');
            document.getElementById('location-status').classList.add('text-yellow-600');
            document.getElementById('point-button').disabled = true;
            window.pointLocationData = null;
            renderPointClock(employeeId); // Recarrega para iniciar a busca de localização
        }
    }
}

function updateRecordsList(records) {
    const listElement = document.getElementById('today-records-list');
    if (listElement) {
        listElement.innerHTML = records.map(r => `
            <li class="flex justify-between items-center text-gray-700 text-sm bg-blue-50 p-2 rounded-md">
                <span><i class="fa-solid fa-arrow-right-to-bracket mr-2"></i> ${r.time}</span>
                <span class="text-xs text-blue-700 font-medium">${r.location || 'Local Não Registrado'}</span>
            </li>
        `).join('');
    }
}


function pointLogout() {
    localStorage.removeItem('employeeId');
    currentEmployeeId = null;
    if (window.pointClockInterval) {
        clearInterval(window.pointClockInterval);
    }
    // Redireciona para a tela de login de ponto
    router('employee-point');
}


// ----------------------------------------------------
// TELA DE AUTOCADASTRO (Público)
// ----------------------------------------------------

async function renderAutocadastroScreen() {
    await loadGlobalConfig(); // Garante que a config está atualizada

    const estadosHtml = globalConfig.estados ? globalConfig.estados.map(e => `<option value="${e.uf} - ${e.name}">${e.uf} - ${e.name}</option>`).join('') : '<option value="">(Cadastre estados em Configurações)</option>';

    appContent.innerHTML = `
        <div class="flex flex-col justify-center items-center p-4">
            <div class="bg-white text-gray-800 p-8 rounded-lg shadow-2xl w-full max-w-2xl mt-5">
                <h2 class="text-2xl font-bold text-center mb-6 text-slate-800">Autocadastro de Colaborador</h2>
                <p class="text-center text-gray-600 mb-6">Preencha seus dados para iniciar o processo de cadastro. Suas credenciais de login serão exibidas ao final.</p>
                <form id="autocadastro-form" class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <!-- Nome Completo -->
                        <div>
                            <label for="a-nome" class="block text-sm font-medium text-gray-700">Nome Completo <span class="text-red-500">*</span></label>
                            <input type="text" id="a-nome" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-3 border focus:border-green-500 focus:ring-green-500">
                        </div>
                        <!-- CPF -->
                        <div>
                            <label for="a-cpf" class="block text-sm font-medium text-gray-700">CPF <span class="text-red-500">*</span></label>
                            <input type="text" id="a-cpf" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-3 border focus:border-green-500 focus:ring-green-500" pattern="[0-9]{11}" title="Apenas 11 dígitos numéricos">
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <!-- RG -->
                        <div>
                            <label for="a-rg" class="block text-sm font-medium text-gray-700">RG</label>
                            <input type="text" id="a-rg" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-3 border focus:border-green-500 focus:ring-green-500">
                        </div>
                        <!-- Data Nascimento -->
                        <div>
                            <label for="a-nasc" class="block text-sm font-medium text-gray-700">Data de Nascimento</label>
                            <input type="date" id="a-nasc" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-3 border focus:border-green-500 focus:ring-green-500">
                        </div>
                    </div>

                    <!-- PIS/NIS -->
                    <div>
                        <label for="a-pis" class="block text-sm font-medium text-gray-700">PIS/NIS</label>
                        <input type="text" id="a-pis" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-3 border focus:border-green-500 focus:ring-green-500">
                    </div>

                    <!-- Endereço -->
                    <div>
                        <label for="a-end" class="block text-sm font-medium text-gray-700">Endereço (Rua, Número, Bairro) <span class="text-red-500">*</span></label>
                        <input type="text" id="a-end" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-3 border focus:border-green-500 focus:ring-green-500">
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <!-- Estado (UF) -->
                        <div>
                            <label for="a-uf" class="block text-sm font-medium text-gray-700">Estado (UF) <span class="text-red-500">*</span></label>
                            <select id="a-uf" onchange="loadMunicipios(this.value, 'a-mun')" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-3 border bg-white focus:border-green-500 focus:ring-green-500">
                                <option value="">Selecione a UF</option>
                                ${estadosHtml}
                            </select>
                        </div>
                        <!-- Município -->
                        <div>
                            <label for="a-mun" class="block text-sm font-medium text-gray-700">Município <span class="text-red-500">*</span></label>
                            <select id="a-mun" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-3 border bg-white focus:border-green-500 focus:ring-green-500" disabled>
                                <option value="">Selecione o Estado Primeiro</option>
                            </select>
                        </div>
                    </div>

                    <p id="autocadastro-message" class="text-sm text-red-500 text-center"></p>

                    <button type="submit" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg shadow-md transition-colors">
                        <i class="fa-solid fa-user-check"></i> Finalizar Cadastro
                    </button>
                </form>
            </div>
        </div>
    `;

    document.getElementById('autocadastro-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitAutocadastro(e.target);
    });
}

async function loadMunicipios(ufName, targetSelectId, selectedCity = null) {
    const ufCode = ufName.split(' - ')[0];
    const select = document.getElementById(targetSelectId);

    if (!select) return;

    select.innerHTML = '<option value="">Carregando Municípios...</option>';
    select.disabled = true;

    if (!ufCode) {
        select.innerHTML = '<option value="">Selecione o Estado Primeiro</option>';
        return;
    }

    try {
        // Simulação de carregamento de municípios
        // Em um app real, isso buscaria dados de um banco ou API de municípios.
        const mockMunicipios = {
            'SP': ['São Paulo', 'Campinas', 'Santos', 'Ribeirão Preto'],
            'RJ': ['Rio de Janeiro', 'Niterói', 'Duque de Caxias'],
            'MG': ['Belo Horizonte', 'Contagem', 'Uberlândia', 'Juiz de Fora'],
            'BA': ['Salvador', 'Feira de Santana', 'Vitória da Conquista'],
            // Adicione mais estados conforme necessário
        };
        const municipios = mockMunicipios[ufCode] || ['Município Mock 1', 'Município Mock 2'];

        let options = '<option value="">Selecione um Município</option>';
        municipios.forEach(m => {
            options += `<option value="${m}" ${selectedCity === m ? 'selected' : ''}>${m}</option>`;
        });

        select.innerHTML = options;
        select.disabled = false;
        select.value = selectedCity || ''; // Tenta manter a cidade selecionada se houver
    } catch (e) {
        console.error("Erro ao carregar municípios:", e);
        select.innerHTML = '<option value="">Erro ao Carregar Municípios</option>';
    }
}


async function submitAutocadastro(form) {
    const el = document.getElementById('app-content');
    const msg = document.getElementById('autocadastro-message');
    const submitButton = form.querySelector('button[type="submit"]');

    msg.textContent = '';
    submitButton.disabled = true;
    submitButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Cadastrando...`;

    try {
        const cpfValue = document.getElementById('a-cpf').value;

        // 1. Verificar se o CPF já existe
        const employeesRef = getColl('employees');
        const q = query(employeesRef, where('cpf', '==', cpfValue));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            msg.textContent = 'Erro: Este CPF já está cadastrado no sistema.';
            return;
        }

        // 2. Gerar credenciais de acesso
        const nomeValue = document.getElementById('a-nome').value;
        const baseUser = nomeValue.toLowerCase().split(' ')[0] + cpfValue.slice(-4);
        const genUser = baseUser.replace(/[^a-z0-9]/g, '');
        const genPass = generateRandomString(6);

        const data = {
            nomeCompleto: nomeValue,
            cpf: cpfValue,
            rg: document.getElementById('a-rg').value,
            dataNascimento: document.getElementById('a-nasc').value,
            nisPIS: document.getElementById('a-pis').value,
            endereco: document.getElementById('a-end').value,
            estado: document.getElementById('a-uf').value,
            municipio: document.getElementById('a-mun').value,
            loginUser: genUser,
            loginPass: genPass,
            cargo: 'Novo (Aguardando)', // Default: aguardando aprovação/edição do gestor
            jornadaHHMM: '08:00',
            createdAt: serverTimestamp()
        };

        await addDoc(getColl('employees'), data);

        // 3. Exibir tela de sucesso com as credenciais
        el.innerHTML = `
            <div class="max-w-md mx-auto bg-white p-8 rounded-lg shadow-2xl text-center mt-20 border-t-4 border-green-500">
                <i class="fa-solid fa-check-circle text-6xl text-green-500 mb-4"></i>
                <h2 class="text-2xl font-bold text-slate-800">Cadastro Realizado com Sucesso!</h2>
                <p class="text-gray-600 mt-4">Seu pré-cadastro foi enviado para aprovação. Anote suas credenciais provisórias para a Batida de Ponto:</p>
                <div class="bg-gray-100 p-4 rounded-lg mt-6 font-mono text-lg border border-dashed border-gray-400 text-left">
                    <p class="mb-2">Usuário: <b class="text-green-700">${genUser}</b></p>
                    <p>Senha: <b class="text-green-700">${genPass}</b></p>
                </div>
                <p class="text-sm text-gray-500 mt-4">Use estas credenciais no <a href="?view=point" class="text-blue-600 hover:text-blue-800 font-semibold">Link de Batida de Ponto</a>.</p>
                <button onclick="window.location.reload()" class="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors">
                    Voltar ao Início
                </button>
            </div>
        `;

    } catch (e) {
        console.error("Erro no autocadastro:", e);
        msg.textContent = `Erro ao finalizar o cadastro: ${e.message}`;
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = `<i class="fa-solid fa-user-check"></i> Finalizar Cadastro`;
    }
}


// ----------------------------------------------------
// UTILITÁRIOS GERAIS
// ----------------------------------------------------

function formatDateBR(dateString) {
    if (!dateString) return 'N/A';
    // 'YYYY-MM-DD' -> 'DD/MM/YYYY'
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
}


// ----------------------------------------------------
// INICIALIZAÇÃO E AUTENTICAÇÃO
// ----------------------------------------------------

async function setupAndGoToDashboard() {
    // 1. Inicializa a aplicação
    document.getElementById('login-screen').classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    isAuthenticated = true;

    // 2. Carrega as configurações globais (cargos, estados, etc.)
    await loadGlobalConfig();

    // 3. Define a rota inicial
    const urlParams = new URLSearchParams(window.location.search);
    const view = urlParams.get('view');

    if (view === 'point') {
        // Se for a URL pública de ponto, não mostra o sidebar e vai direto para o relógio
        document.getElementById('sidebar').classList.add('hidden');
        document.getElementById('main-container').classList.remove('md:ml-64');
        router('employee-point');
    } else if (view === 'autocadastro') {
        // Se for a URL pública de autocadastro, não mostra o sidebar e vai direto para o formulário
        document.getElementById('sidebar').classList.add('hidden');
        document.getElementById('main-container').classList.remove('md:ml-64');
        router('autocadastro');
    } else {
        // Se for acesso ao painel de gestão
        document.getElementById('sidebar').classList.remove('hidden');
        document.getElementById('main-container').classList.add('md:ml-64');
        router('dashboard');
    }
}

// Listener para inicialização da autenticação
onAuthStateChanged(auth, async (user) => {
    // Se for o token customizado da Canvas, o `user` estará presente
    if (user) {
        // Se o usuário já está logado (gestor via token ou colaborador via login de ponto)
        await setupAndGoToDashboard();
        return;
    }

    // Se não há usuário logado e não estamos em uma tela pública (ponto ou autocadastro)
    const urlParams = new URLSearchParams(window.location.search);
    const view = urlParams.get('view');

    if (view === 'point') {
        document.getElementById('sidebar').classList.add('hidden');
        document.getElementById('main-container').classList.remove('md:ml-64');
        router('employee-point');
        return;
    }

    if (view === 'autocadastro') {
        document.getElementById('sidebar').classList.add('hidden');
        document.getElementById('main-container').classList.remove('md:ml-64');
        router('autocadastro');
        return;
    }

    // Se estamos na raiz e não logado, mostra tela de login do gestor
    document.getElementById('login-screen').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    document.getElementById('app-content').innerHTML = ''; // Limpa o loader
});

// Inicialização de Auth via token customizado (Se disponível)
// O canvas fornece um token customizado na variável global __initial_auth_token
document.addEventListener('DOMContentLoaded', async () => {
    const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
    const auth = getAuth(app);
    const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

    if (initialAuthToken) {
        try {
            // Tenta fazer login com o token customizado para o gestor
            await signInWithCustomToken(auth, initialAuthToken);
        } catch (error) {
            console.error("Erro ao fazer login com token customizado:", error);
            // Se falhar, tentará o fluxo normal (login anônimo/tela de login) via onAuthStateChanged
        }
    } else if (!auth.currentUser) {
        // Se não há token customizado e não há usuário atual (fluxo normal do firebase),
        // o onAuthStateChanged irá capturar a ausência de login.
    }

    // Listener de submissão do formulário de login do Gestor (apenas se não estiver logado)
    const formLogin = document.getElementById('form-login');
    if (formLogin) {
        formLogin.addEventListener('submit', (e) => {
            e.preventDefault();
            const user = document.getElementById('l-user').value;
            const pass = document.getElementById('l-pass').value;
            login(user, pass);
        });
    }
});
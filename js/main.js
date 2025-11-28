// js/main.js (Corrigido)

import * as fb from './firebase.js';
import { renderKioskLogin } from './renders/renderKiosk.js';
import { renderAutoCadastro } from './renders/renderAutoCadastro.js';

// STATE (Compartilhado entre todos os módulos)
export let company = {}, struct = { roles:[], holidays:[], networks:[], stores:[], states:[] };
export let employees = [];
export let currentKioskEmployee = null; 

// --- DATA LOADERS ---
export async function loadCompany() {
    const snap = await fb.getDocs(fb.getColl('config'));
    company = snap.empty ? {nome:'Minha Empresa', logo:''} : {id:snap.docs[0].id, ...snap.docs[0].data()};
}
export async function loadStruct() {
    const load = async (k) => {
        const s = await fb.getDocs(fb.getColl(k));
        struct[k] = s.docs.map(d=>({id:d.id, ...d.data()}));
    };
    await Promise.all(['roles','holidays','networks','stores','states'].map(load));
}
export async function loadEmployees() {
    const snap = await fb.getDocs(fb.getColl('employees'));
    employees = snap.docs.map(d => ({id:d.id, ...d.data()}));
}

// --- INIT (Ponto de Entrada Global) ---
async function init() {
    await fb.signInAnonymously(fb.auth);

    const isAuto = window.location.search.includes('mode=auto');
    const isGestor = document.body.id === 'gestor-page';
    const isColaborador = document.body.id === 'colaborador-page';

    // 1. FLUXO DE AUTOCADASTRO
    if (isAuto) {
        // Oculta login do gestor e exibe o conteúdo
        if (document.getElementById('login-screen')) document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('main-container').classList.remove('hidden');
        
        // Carrega dados e renderiza a tela
        await Promise.all([loadCompany(), loadStruct(), loadEmployees()]);
        return renderAutoCadastro(document.getElementById('app-content'));
    }

    // 2. FLUXO DE COLABORADOR
    if (isColaborador) {
        // Carrega dados e renderiza o login do quiosque
        await Promise.all([loadCompany(), loadStruct(), loadEmployees()]);
        return renderKioskLogin(document.getElementById('app-content'));
    }

    // 3. FLUXO PADRÃO: PÁGINA DO GESTOR (index.html)
    if (isGestor) {
        // **CORREÇÃO APLICADA: Torna a tela de login visível imediatamente**
        document.getElementById('login-screen').classList.remove('hidden');

        // Monitora o estado de autenticação para carregar os dados
        fb.onAuthStateChanged(fb.auth, async (u) => {
            if(u) {
                // Se estiver autenticado (anônimo), carrega dados
                await Promise.all([loadCompany(), loadStruct(), loadEmployees()]);
                // O restante da lógica (login de administrador) é tratada em renderAdmin.js
            }
        });
        return; // Termina a execução do init para o gestor aqui
    }
}

// O Router é global para ser chamado pelos botões da sidebar
window.router = async (view) => {
    // A lógica de roteamento está em renderAdmin.js, mas o shell está aqui.
    if (document.body.id === 'gestor-page' && window.handleAdminRouting) {
        window.handleAdminRouting(view);
    }
};

init();
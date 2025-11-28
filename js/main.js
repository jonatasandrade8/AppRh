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

    fb.onAuthStateChanged(fb.auth, async (u) => {
        if(u) {
            await Promise.all([loadCompany(), loadStruct(), loadEmployees()]);

            // Se for Autocadastro, renderiza a tela e sai
            if (isAuto) {
                // Remove tela de login do gestor se estiver presente
                if (document.getElementById('login-screen')) document.getElementById('login-screen').classList.add('hidden');
                document.getElementById('main-container').classList.remove('hidden');
                return renderAutoCadastro(document.getElementById('app-content'));
            }

            // FLUXO DE GESTOR (index.html)
            if (isGestor) {
                // A lógica de login/verificação de admin é disparada em renderAdmin.js
                // O init apenas garante que os dados estejam carregados.
                return;
            } 
            
            // FLUXO DE COLABORADOR (login-colaborador.html)
            if (isColaborador) {
                // Inicia o fluxo de login do quiosque
                return renderKioskLogin(document.getElementById('app-content'));
            }
        }
    });
}

// O Router é global para ser chamado pelos botões da sidebar
window.router = async (view) => {
    // A lógica de roteamento está em renderAdmin.js, mas o shell está aqui.
    if (document.body.id === 'gestor-page' && window.handleAdminRouting) {
        window.handleAdminRouting(view);
    }
};

init();
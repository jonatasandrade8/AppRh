// js/renders/renderKiosk.js

import * as fb from '../firebase.js';
import * as main from '../main.js';

let clockInterval; // Para controlar o relógio

// --- MAIN KIOSK RENDERER ---
export function renderKioskLogin(el) {
    if (clockInterval) clearInterval(clockInterval); // Limpa intervalo se houver

    // Se já estiver logado (currentKioskEmployee existe), vai direto para o relógio
    if (main.currentKioskEmployee) {
        return renderPointClock(el, main.currentKioskEmployee);
    }
    
    // Renderiza a tela de login
    el.innerHTML = `
        <div class="bg-white p-8 rounded-lg shadow-2xl w-full max-w-sm text-center">
            ${main.company.logo ? `<img src="${main.company.logo}" class="h-16 mx-auto mb-4">` : ''}
            <h2 class="text-2xl font-bold mb-2 text-slate-800">Ponto Eletrônico</h2>
            <p class="text-gray-500 text-sm mb-6">Faça login para registrar</p>
            
            <form id="ponto-login" class="space-y-4">
                <input id="k-user" class="w-full border p-3 rounded bg-gray-50" placeholder="Usuário">
                <input id="k-pass" type="password" class="w-full border p-3 rounded bg-gray-50" placeholder="Senha">
                <button type="submit" class="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700 shadow-lg">ENTRAR</button>
            </form>
        </div>
    `;

    document.getElementById('ponto-login').onsubmit = async (e) => {
        e.preventDefault();
        const u = document.getElementById('k-user').value;
        const p = document.getElementById('k-pass').value;
        
        const q = fb.query(fb.getColl('employees'), fb.where('loginUser','==',u), fb.where('loginPass','==',p));
        const snap = await fb.getDocs(q);
        
        if(snap.empty) return alert('Dados incorretos');
        
        const emp = {id:snap.docs[0].id, ...snap.docs[0].data()};
        
        main.currentKioskEmployee = emp; // Define estado global
        
        renderPointClock(el, emp);
    }
}

// --- CLOCK RENDERER ---
function renderPointClock(el, emp) {
    if (clockInterval) clearInterval(clockInterval); // Limpa intervalo anterior

    el.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div class="bg-blue-600 p-6 text-white text-center">
                <h2 class="text-2xl font-bold">Olá, ${emp.nomeCompleto.split(' ')[0]}</h2>
                <p class="opacity-80 text-sm">${emp.cargo}</p>
            </div>
            
            <div class="flex justify-around border-b text-sm font-semibold text-gray-600">
                <button onclick="window.switchTabKiosk('ponto-tab')" id="tab-ponto-btn" class="p-3 border-b-2 border-blue-600 font-bold">Bater Ponto</button>
                <button onclick="window.switchTabKiosk('historico-tab')" id="tab-historico-btn" class="p-3 border-b-2 border-transparent">Meu Histórico</button>
            </div>

            <div id="ponto-tab" class="p-8 text-center">
                <div id="clock" class="text-5xl font-mono font-bold text-slate-700 mb-2">--:--</div>
                <div id="date" class="text-gray-400 font-bold uppercase text-xs mb-8">--</div>
                
                <div id="last-reg" class="bg-gray-100 p-2 rounded text-sm mb-6">Último: <span id="last-st">...</span></div>

                <button id="btn-hit" class="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-xl font-bold text-xl transition transform active:scale-95">
                    REGISTRAR PONTO
                </button>
                
                <button onclick="window.logoutPontoKiosk()" class="mt-6 text-gray-400 text-sm hover:text-red-500 underline">Sair / Trocar Conta</button>
            </div>
            
            <div id="historico-tab" class="hidden p-4 md:p-6 overflow-y-auto max-h-[70vh]">
                <div id="historico-content">Carregando histórico...</div>
            </div>
        </div>
    `;

    // Atualiza o relógio
    clockInterval = setInterval(() => {
        const d = new Date();
        const clockEl = document.getElementById('clock');
        const dateEl = document.getElementById('date');
        if(clockEl) clockEl.innerText = d.toLocaleTimeString('pt-BR');
        if(dateEl) dateEl.innerText = d.toLocaleDateString('pt-BR',{weekday:'long', day:'numeric', month:'long'});
    }, 1000);

    updatePointButton(emp);
}

// --- BUTTON UPDATE LOGIC ---
async function updatePointButton(emp) {
    const q = fb.query(fb.getColl('registros_ponto'));
    const snap = await fb.getDocs(q);
    const today = new Date().toISOString().split('T')[0];
    const recs = snap.docs.map(d=>d.data()).filter(r => r.userId === emp.id && r.timestamp.toDate().toISOString().startsWith(today)).sort((a,b)=>a.timestamp-b.timestamp);
    const last = recs.length ? recs[recs.length-1].tipo : 'Nenhum';
    
    const lastEl = document.getElementById('last-st');
    if (lastEl) lastEl.innerText = last;
    
    const btn = document.getElementById('btn-hit');
    if (!btn) return;

    let next = 'Entrada';
    if(last === 'Entrada') next = 'Saída Almoço';
    else if(last === 'Saída Almoço') next = 'Volta Almoço';
    else if(last === 'Volta Almoço') next = 'Saída';
    if(last === 'Saída') next = 'Entrada (Aguardando Novo Dia)'; 
    
    btn.innerText = `REGISTRAR ${next.toUpperCase()}`;
    btn.disabled = (last === 'Saída');

    btn.onclick = async () => {
        if (next.includes('Aguardando')) return; 
        btn.disabled = true;
        await fb.addDoc(fb.getColl('registros_ponto'), { userId: emp.id, tipo: next, timestamp: fb.serverTimestamp() });
        alert(`Ponto de ${next} registrado!`);
        renderPointClock(document.getElementById('app-content'), emp); 
    }
}

// --- WINDOW FUNCTIONS (GLOBALIZED FOR ONCLICK) ---

// Função de troca de aba do Quiosque
window.switchTabKiosk = (tabId) => {
    document.getElementById('ponto-tab').classList.add('hidden');
    document.getElementById('historico-tab').classList.add('hidden');
    
    document.getElementById('tab-ponto-btn').classList.remove('border-blue-600', 'font-bold');
    document.getElementById('tab-historico-btn').classList.remove('border-blue-600', 'font-bold');
    
    document.getElementById(tabId).classList.remove('hidden');
    document.getElementById(`tab-${tabId}-btn`).classList.add('border-blue-600', 'font-bold');

    if(tabId === 'historico-tab') renderHistoricoPonto(main.currentKioskEmployee);
}

// Função de renderização do Histórico (com correção de query)
window.renderHistoricoPonto = async (emp) => {
    const el = document.getElementById('historico-content');
    el.innerHTML = '<div class="flex justify-center mt-4"><div class="loader"></div></div>';

    try {
        const q = fb.query(
            fb.getColl('registros_ponto'), 
            fb.where('userId','==',emp.id),
            fb.orderBy('timestamp', 'desc') 
        );
        const snap = await fb.getDocs(q);
        
        const allPoints = snap.docs.map(d => ({...d.data(), d:d.data().timestamp.toDate()})).sort((a,b)=>b.d-a.d);

        // 1. Batidas do Dia
        const today = new Date().toLocaleDateString('pt-BR');
        const todayPoints = allPoints.filter(p => p.d.toLocaleDateString('pt-BR') === today).sort((a,b)=>a.d-b.d); 
        const dailyHtml = `
            <h3 class="font-bold text-lg mb-3">Batidas de Hoje</h3>
            <ul class="space-y-2 text-sm max-h-[30vh] overflow-y-auto">${todayPoints.map(p => 
                `<li class="bg-gray-100 p-3 rounded flex justify-between items-center shadow-sm">
                    <span class="font-semibold text-slate-700">${p.tipo}</span>
                    <span class="font-mono text-xs text-gray-500">${p.d.toLocaleTimeString('pt-BR')}</span>
                </li>`).join('') || '<li class="text-gray-500 p-3 bg-gray-50 rounded">Nenhuma batida registrada hoje.</li>'}
            </ul>
        `;
        
        // 2. Histórico Mensal
        const uniqueDays = [...new Set(allPoints.map(p => p.d.toLocaleDateString('pt-BR')))].slice(0, 30);
        
        const rows = uniqueDays.map(dayStr => {
            const dayPoints = allPoints.filter(p => p.d.toLocaleDateString('pt-BR') === dayStr).sort((a,b)=>a.d-b.d);
            const dayOfWeek = dayPoints[0].d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
            
            const getT = (type) => {
                const f = dayPoints.find(x => x.tipo.includes(type));
                return f ? f.d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '--:--';
            };
            return `
                <tr class="border-b hover:bg-gray-50">
                    <td class="p-2 font-bold">${dayStr.slice(0,5)} (${dayOfWeek})</td>
                    <td class="p-2">${getT('Entrada')}</td>
                    <td class="p-2">${getT('Saída Almoço')}</td>
                    <td class="p-2">${getT('Volta Almoço')}</td>
                    <td class="p-2">${getT('Saída')}</td>
                </tr>
            `;
        }).join('');

        const monthlyHtml = `
            <h3 class="font-bold text-lg mt-6 mb-3">Histórico Mensal (Últimos 30 Dias)</h3>
            <div class="overflow-x-auto border rounded">
                <table class="w-full text-sm text-left whitespace-nowrap">
                    <thead class="bg-gray-100 uppercase text-xs">
                        <tr><th class="p-2">Data</th><th class="p-2">Ent.1</th><th class="p-2">Sai.1</th><th class="p-2">Ent.2</th><th class="p-2">Sai.2</th></tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            ${uniqueDays.length === 0 ? '<p class="text-gray-500 mt-2">Nenhum registro encontrado no último mês.</p>' : ''}
        `;

        el.innerHTML = dailyHtml + monthlyHtml;
    } catch(error) {
        console.error("Error loading historical points:", error);
        el.innerHTML = `<p class="text-red-500">Erro ao carregar o histórico: ${error.message}</p>`;
    }
}

// Função de Logout do Quiosque
window.logoutPontoKiosk = () => {
    if (clockInterval) clearInterval(clockInterval);
    main.currentKioskEmployee = null; 
    renderKioskLogin(document.getElementById('app-content'));
}
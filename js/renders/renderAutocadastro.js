// js/renders/renderAutoCadastro.js

import * as fb from '../api.js';
import * as main from '../main.js';

export function renderAutoCadastro(el) {
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
                        ${main.struct.states.map(s => `<option>${s.name}</option>`).join('')}
                    </select>
                    <input id="a-mun" class="border p-2 rounded" placeholder="Município" required>
                </div>
                <button type="submit" class="w-full bg-green-600 text-white py-3 rounded font-bold hover:bg-green-700">ENVIAR CADASTRO</button>
            </form>
        </div>
    `;

    document.getElementById('form-auto').onsubmit = async (e) => {
        e.preventDefault();
        const genUser = document.getElementById('a-nome').value.split(' ')[0].toLowerCase() + Math.floor(Math.random() * 100);
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

        await fb.addDoc(fb.getColl('employees'), data);
        el.innerHTML = `
            <div class="max-w-md mx-auto bg-white p-8 rounded shadow text-center mt-20">
                <i class="fa-solid fa-check-circle text-5xl text-green-500 mb-4"></i>
                <h2 class="text-2xl font-bold">Cadastro Realizado!</h2>
                <p class="text-gray-600 mt-2">Anote suas credenciais provisórias:</p>
                <div class="bg-gray-100 p-4 rounded mt-4 font-mono text-lg border border-dashed border-gray-400">
                    <p>Usuário: <b>${genUser}</b></p>
                    <p>Senha: <b>${genPass}</b></p>
                </div>
                <p class="text-xs text-gray-400 mt-4">Acesse <a href="login-colaborador.html" class="text-blue-500 hover:underline">a tela de ponto</a> com estas credenciais.</p>
            </div>
        `;
    }
}
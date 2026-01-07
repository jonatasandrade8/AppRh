# RH Enterprise System

Sistema de Gestão de RH e Ponto Eletrônico com Backend em Google Apps Script & Sheets.

## 🚀 Funcionalidades

- **Gestão de Colaboradores**: Cadastro completo, edição e controle de acesso.
- **Ponto Eletrônico (Quiosque)**: Interface simplificada para registro de ponto com **Geolocalização**.
- **Autocadastro**: Link público para candidatos preencherem seus dados.
- **Relatórios**: Geração de espelho de ponto com cálculo de horas e observações.
- **Estrutura**: Gerenciamento de Lojas, Redes, Cargos e Feriados.
- **Backend Serverless**: Utiliza Google Sheets como banco de dados gratuito e confiável.

---

## 🛠️ Instalação e Configuração

Siga estes passos para configurar o backend (obrigatório).

### 1. Configurar o Banco de Dados (Google Sheets)

1.  Crie uma nova planilha no [Google Sheets](https://sheets.new).
2.  Vá em **Extensões** > **Apps Script**.
3.  Copie o conteúdo do arquivo `Code.gs` deste projeto e cole no editor do Apps Script.
4.  Salve o projeto (ícone de disquete).
5.  Recarregue a página da planilha.
6.  Um novo menu chamado **RH Enterprise** aparecerá no topo.
7.  Clique em **RH Enterprise** > **Configurar Banco de Dados**.
    - Isso criará automaticamente todas as abas necessárias (`employees`, `registros_ponto`, etc.).

### 2. Implantar a API (Backend)

1.  No editor do Apps Script, clique no botão azul **Implantar** (Deploy) > **Nova implantação**.
2.  Selecione o tipo: **App da Web**.
3.  Preencha:
    - **Descrição**: `v1` (ou qualquer nome).
    - **Executar como**: **Eu** (sua conta Google).
    - **Quem pode acessar**: **Qualquer pessoa** (Isso é crucial para que o frontend funcione sem login do Google).
4.  Clique em **Implantar**.
5.  **Copie a URL do App da Web** gerada (termina em `/exec`).

### 3. Conectar o Frontend

1.  Abra o arquivo `js/api.js` no seu editor de código.
2.  Localize a constante `API_URL` na linha 7.
3.  Substitua o valor pela URL que você copiou no passo anterior.

```javascript
// Exemplo:
const API_URL = "https://script.google.com/macros/s/SEU_ID_GIGANTE_AQUI/exec";
```

---

## 🖥️ Como Usar

Não é necessário servidor (Node/PHP). O projeto roda diretamente no navegador.

1.  Abra o arquivo `index.html` no seu navegador (clique duplo ou use uma extensão como Live Server).
2.  **Login do Gestor**:
    - Usuário padrão: `admin`
    - Senha padrão: `123456`
    - (Você pode alterar isso na aba `admins` da planilha).
3.  **Quiosque de Ponto**:
    - Acesse via menu "Links de Acesso" no painel do gestor ou abra `login-colaborador.html`.
    - O colaborador usa o usuário/senha cadastrados no perfil dele.
    - **Nota**: A geolocalização será solicitada ao bater o ponto.

---

## 📂 Estrutura de Arquivos

- `index.html`: Painel Administrativo e Autocadastro.
- `login-colaborador.html`: Interface do Quiosque de Ponto.
- `js/main.js`: Lógica principal e roteamento.
- `js/api.js`: Adaptador de comunicação com o Google Apps Script.
- `js/renders/`: Módulos de interface (Admin, Kiosk, Autocadastro).
- `Code.gs`: Código do backend (deve estar no Apps Script).

---

## ⚠️ Requisitos

- Navegador moderno (Chrome, Edge, Firefox).
- Conexão com a internet (para acessar o Google Sheets).
- Permissão de localização ativada para o registro de ponto.

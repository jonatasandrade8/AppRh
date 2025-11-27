Sistema de Gestão de Ponto e RH v3.0 (Enterprise)

Sistema web completo (SPA) para gestão de RH, Ponto Eletrônico e Varejo (Promotores/Lojas).

Novidades na Versão 3.0

Autocadastro e Link Público: Permite que candidatos ou novos funcionários se cadastrem sozinhos via link dedicado.

Gestão de Varejo: Cadastro de Redes, Lojas e Cargos.

Lógica de Promotores:

Promotor Fixo: Vinculado a apenas uma loja.

Promotor Roteirista: Vinculado a múltiplas lojas/redes.

Login do Colaborador: Geração automática de credenciais e opção "Manter conectado".

Feriados Inteligentes: Cadastro de feriados Nacionais, Estaduais e Municipais. O sistema identifica automaticamente se foi feriado para o colaborador baseado no endereço dele.

Upload de Logo: Suporte para envio de arquivo de imagem (armazenado internamente).

Instalação e Configuração

1. Configuração do Firebase (Obrigatório)

Siga os passos padrão para criar um projeto no Firebase Console:

Crie um projeto Web.

Ative Authentication (Método Anônimo).

Ative Firestore Database (Modo Teste).

Copie as chaves de configuração.

2. Configurando o Arquivo

Abra o arquivo index.html e cole suas credenciais na variável firebaseConfig.

3. Primeiro Acesso (Admin)

Acesse o sistema. Se for a primeira vez, use:

Usuário: admin

Senha: 123456

Vá em Configurações > Estrutura para cadastrar:

Estados atendidos.

Cargos (Ex: Promotor Fixo, Promotor Roteirista).

Redes e Lojas.

Feriados.

4. Links Disponíveis

No menu lateral, clique em Links de Acesso para obter:

Link do Ponto: Para o funcionário bater ponto (requer login gerado no cadastro).

Link de Autocadastro: Para novos colaboradores preencherem seus dados iniciais.

Estrutura de Dados e Regras

Imagens: O logo é convertido para Base64. Recomenda-se usar imagens pequenas (png/jpg) abaixo de 100KB para não sobrecarregar o banco de dados.

Feriados: Ao gerar o relatório, o sistema verifica: Feriados Nacionais + Feriados do Estado do Colaborador + Feriados do Município do Colaborador.

Ocorrências: No relatório, clique em qualquer dia para adicionar justificativas (Atestado, Folga, etc).

Requisitos

Navegador moderno.

Conexão com internet.

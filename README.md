# Bot de Whitelist SA-MP para Discord

Projeto inicial com:
- Painel `/painel-whitelist`
- Formulário por botão
- Code exclusivo gerado automaticamente
- Registro persistente em SQLite
- Envio da ficha para o canal privado da staff
- Consulta `/buscar-whitelist`
- Remoção `/remover-whitelist`

## Requisitos
- Node.js 20 ou superior
- Aplicação criada no Discord Developer Portal
- Canal privado da staff criado no servidor
- Hospedagem que execute processos Node.js

## Variáveis de ambiente
Configure no painel da hospedagem:
- `BOT_TOKEN`: token do bot (segredo)
- `CLIENT_ID`: Application ID
- `GUILD_ID`: ID do servidor Discord
- `STAFF_CHANNEL_ID`: ID do canal privado da staff
- `DB_PATH`: caminho do arquivo SQLite, por exemplo `/data/whitelist.db`

## Discord Developer Portal
Em OAuth2 > URL Generator, selecione os escopos `bot` e `applications.commands`.
Permissões necessárias: View Channels, Send Messages, Embed Links. Garanta que o bot também tenha acesso ao canal da staff.
Adicione o bot ao servidor pelo link de autorização gerado.

## Executar
```bash
npm install
npm start
```

Ao iniciar, o bot registra os comandos de servidor e cria a tabela SQLite automaticamente.

## Persistência na hospedagem
SQLite só é persistente se `DB_PATH` apontar para um volume/disco persistente montado pela hospedagem. Não use armazenamento efêmero. Faça backups regulares do banco.

## Segurança
- Nunca envie o token do bot a ninguém.
- Não coloque o arquivo `.env` nem o banco no GitHub.
- Restrinja o canal da staff.
- O code é um identificador de registro, não uma senha de login.
- Esta versão marca registros como `Pendente`; aprovação/reprovação por botões pode ser adicionada depois.

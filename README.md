# ERCOMAQ — App de Ordens de Serviço

Sistema web para registrar e gerenciar ordens de serviço do início ao fim:
técnico lança → revisor normaliza → envia ao cliente → cliente aprova → comercial cobra.

## Como rodar no computador

1. Instale o Node.js LTS (versão 18 ou superior): https://nodejs.org
2. Abra o terminal na pasta do projeto e rode:
   npm install
3. Copie o arquivo .env.example para .env (opcional, os padrões já funcionam)
4. Inicie o servidor:
   npm start
5. Abra no navegador: http://localhost:3000

## Usuários de teste (criados automaticamente)

| Perfil      | E-mail                    | Senha        |
|-------------|---------------------------|--------------|
| Admin       | admin@ercomaq.com.br      | admin123     |
| Revisor     | revisor@ercomaq.com.br    | revisor123   |
| Técnico     | tecnico@ercomaq.com.br    | tecnico123   |
| Comercial   | comercial@ercomaq.com.br  | comercial123 |

Já vem uma OS de exemplo (OS-0001) em revisão para você testar o fluxo completo.

## Fluxo de trabalho

rascunho → em revisão → aguardando cliente → aprovada → cobrada → cancelada

- O técnico cria a OS e descreve os materiais do jeito que entende.
- O revisor normaliza cada material (código ERP + valor) e escolhe os serviços
  do catálogo (valores fixos cadastrados pelo admin).
- O envio ao cliente fica BLOQUEADO enquanto houver material pendente.
- Ao enviar, o sistema gera o relatório e registra e-mails automáticos
  (aviso ao revisor na criação e lembrete a cada 2 dias sem revisão).
- O cliente aprova pelo link de aprovação (simula a confirmação por e-mail).

## E-mails

Sem SMTP configurado, os e-mails aparecem na aba "Notificações" do app.
Para envio real, preencha SMTP_HOST, SMTP_USER, SMTP_PASS e EMAIL_FROM no .env.

## Publicar na web

O app roda em qualquer serviço Node.js: Render, Railway, Fly.io, VPS, etc.
Basta apontar o comando `npm start`, definir as variáveis do .env e usar um
banco SQLite em volume persistente (ou migrar para PostgreSQL depois).
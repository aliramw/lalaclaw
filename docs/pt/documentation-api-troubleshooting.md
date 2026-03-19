[English](../en/documentation-api-troubleshooting.md) | [中文](../zh/documentation-api-troubleshooting.md) | [繁體中文（香港）](../zh-hk/documentation-api-troubleshooting.md) | [日本語](../ja/documentation-api-troubleshooting.md) | [한국어](../ko/documentation-api-troubleshooting.md) | [Français](../fr/documentation-api-troubleshooting.md) | [Español](../es/documentation-api-troubleshooting.md) | [Português](../pt/documentation-api-troubleshooting.md) | [Deutsch](../de/documentation-api-troubleshooting.md) | [Bahasa Melayu](../ms/documentation-api-troubleshooting.md) | [தமிழ்](../ta/documentation-api-troubleshooting.md)

[Voltar ao início](./documentation.md) | [Início rápido](./documentation-quick-start.md) | [Inspetor, pré-visualização de arquivos e rastreamento](./documentation-inspector.md) | [Sessões, agentes e modos de execução](./documentation-sessions.md)

# API e solução de problemas

## Visão geral da API

- `GET /api/session`
- `POST /api/session`
- `GET /api/runtime`
- `POST /api/chat`
- `POST /api/chat/stop`
- `GET /api/file-preview`
- `GET /api/file-preview/content`
- `POST /api/file-manager/reveal`

## Problemas comuns

### A página não carrega e o backend diz que falta `dist`

- Para produção, rode `npm run build` antes de `npm start`
- Para desenvolvimento, siga [Início rápido](./documentation-quick-start.md) e suba Vite e Node juntos

### O app instalado abre em tela branca e o console menciona `mermaid-vendor`

Sintoma típico:

- O bundle carrega, mas a tela fica em branco
- O console do navegador mostra um erro vindo de `mermaid-vendor-*.js`

Causa mais provável:

- Você ainda está no build empacotado antigo `2026.3.19-1`
- Esse build usava uma divisão manual específica do Mermaid que podia quebrar a inicialização em produção após a instalação

Correção:

- Atualize para `lalaclaw@2026.3.19-2` ou mais recente
- Se estiver rodando a partir do código-fonte, puxe o `main` mais recente e reconstrua com `npm run build`

### A página abre em desenvolvimento, mas as chamadas de API falham

Confira primeiro:

- Frontend em `127.0.0.1:5173`
- Backend em `127.0.0.1:3000`
- Uso da entrada do Vite em vez da entrada do servidor de produção

### O OpenClaw está instalado, mas o app continua em `mock`

Verifique:

- Se `~/.openclaw/openclaw.json` existe
- Se `COMMANDCENTER_FORCE_MOCK=1` está definido
- Se `OPENCLAW_BASE_URL` e `OPENCLAW_API_KEY` estão vazios ou incorretos

### As trocas de modelo ou agente parecem não ter efeito

Motivos possíveis:

- Você ainda está em `mock`, então só as preferências locais mudam
- O patch da sessão remota falhou em `openclaw`
- O modelo escolhido já é o padrão do agente

Onde inspecionar:

- A aba `Environment` em [Inspetor, pré-visualização de arquivos e rastreamento](./documentation-inspector.md)
- A saída de console do backend

Se o problema só aparecer ao mudar para outra aba:

- Confirme que o seletor terminou de abrir a sessão alvo antes de enviar a próxima mensagem
- Revise `runtime.transport`, `runtime.socket` e `runtime.fallbackReason` em `Environment`

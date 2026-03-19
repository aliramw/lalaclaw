[English](../en/documentation-sessions.md) | [中文](../zh/documentation-sessions.md) | [繁體中文（香港）](../zh-hk/documentation-sessions.md) | [日本語](../ja/documentation-sessions.md) | [한국어](../ko/documentation-sessions.md) | [Français](../fr/documentation-sessions.md) | [Español](../es/documentation-sessions.md) | [Português](../pt/documentation-sessions.md) | [Deutsch](../de/documentation-sessions.md) | [Bahasa Melayu](../ms/documentation-sessions.md) | [தமிழ்](../ta/documentation-sessions.md)

[Voltar ao início](./documentation.md) | [Início rápido](./documentation-quick-start.md) | [Conversa, anexos e comandos](./documentation-chat.md) | [Atalhos de teclado](./documentation-shortcuts.md) | [Persistência local e recuperação](./documentation-persistence.md)

# Sessões, agentes e modos de execução

## Como uma sessão é identificada

Frontend e backend organizam o estado de sessão em torno de dois valores:

- `agentId`
- `sessionUser`

Na prática:

- `agentId` indica com qual agente você está colaborando
- `sessionUser` indica qual linha de conversa possui o contexto atual

O mesmo agente pode ter vários `sessionUser`, o que permite abrir contexto novo sem trocar de agente.

## Abas de agente e IM

As abas do chat são organizadas pela identidade real da sessão, não apenas pelo rótulo visível.

- A aba principal padrão é `agent:main`
- Abas adicionais de agente costumam reutilizar o mesmo `agentId`, mas têm seu próprio `sessionUser`
- Conversas IM também podem ser abertas diretamente pelo seletor, como threads do DingTalk, Feishu e WeCom
- Cada aba aberta mantém suas próprias mensagens, rascunhos, posição de rolagem e parte dos metadados da sessão
- Fechar uma aba apenas a esconde da interface; não apaga o histórico subjacente

Isso significa:

- Duas abas podem apontar para o mesmo agente com `sessionUser` diferentes
- Abas IM também se resolvem internamente como `agentId + sessionUser`
- Abas de agente já abertas e canais IM já abertos são excluídos do seletor

## Configurações no nível da sessão

Estas preferências são persistidas por sessão no backend:

- Agente
- Modelo
- Fast mode
- Think mode

## Iniciar uma nova sessão

As formas principais de limpar o contexto são:

- Clicar na ação de nova sessão no cabeçalho do chat
- Usar `Cmd/Ctrl + N`
- Enviar `/new` ou `/reset`

## Modo `mock`

O app entra em `mock` quando não detecta um gateway local do OpenClaw ou quando `COMMANDCENTER_FORCE_MOCK=1` está definido.

## Modo `openclaw`

O app entra em `openclaw` quando detecta `~/.openclaw/openclaw.json` ou quando você configura `OPENCLAW_BASE_URL` e variáveis relacionadas.

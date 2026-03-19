[English](../en/documentation-inspector.md) | [中文](../zh/documentation-inspector.md) | [繁體中文（香港）](../zh-hk/documentation-inspector.md) | [日本語](../ja/documentation-inspector.md) | [한국어](../ko/documentation-inspector.md) | [Français](../fr/documentation-inspector.md) | [Español](../es/documentation-inspector.md) | [Português](../pt/documentation-inspector.md) | [Deutsch](../de/documentation-inspector.md) | [Bahasa Melayu](../ms/documentation-inspector.md) | [தமிழ்](../ta/documentation-inspector.md)

[Voltar ao início](./documentation.md) | [Visão geral da interface](./documentation-interface.md) | [Conversa, anexos e comandos](./documentation-chat.md) | [API e solução de problemas](./documentation-api-troubleshooting.md)

# Inspetor, pré-visualização de arquivos e rastreamento

O inspetor à direita é uma das superfícies centrais do LalaClaw. Agora ele organiza as informações da sessão em quatro abas: `Files`, `Artifacts`, `Timeline` e `Environment`.

## Files

A aba `Files` tem duas superfícies:

- `Session Files`: arquivos tocados na conversa atual, agrupados em `Created`, `Modified` e `Viewed`
- `Workspace Files`: árvore enraizada no workspace atual

Comportamentos importantes:

- A árvore do workspace carrega um nível de diretório por vez
- Os contadores permanecem visíveis mesmo com a seção recolhida
- Seções vazias de `Session Files` ficam ocultas
- Os filtros aceitam texto simples e padrões glob básicos

Interações:

- Clique para abrir a pré-visualização
- Clique com o botão direito para copiar o caminho absoluto
- Clique com o botão direito em uma pasta do workspace para recarregar só aquele nível

## Artifacts

`Artifacts` lista os resumos das respostas do assistente da sessão atual.

- Clique em um resumo para voltar à mensagem correspondente
- Use isso para navegar conversas longas mais rápido
- `View Context` mostra o contexto de sessão enviado ao modelo

## Timeline

`Timeline` agrupa os registros por execução:

- Título e horário
- Resumo do prompt e resultado
- Entradas, saídas e estado das ferramentas
- Mudanças de arquivos associadas
- Relações de colaboração do trabalho despachado

## Environment

`Environment` agrega detalhes de runtime como:

- Um resumo superior de `diagnóstico do OpenClaw`, agrupado em `Visão geral`, `Conectividade`, `Doctor` e `Logs`
- Versão do OpenClaw, perfil de runtime, caminho de configuração, raiz do workspace, estado do gateway, URL de saúde e pontos de entrada de log
- Transporte runtime, estado do socket runtime, tentativas de reconexão e motivo de fallback
- Grupos técnicos inferiores para contexto de sessão, sincronização em tempo real, configuração do gateway, aplicação e outros campos

Comportamentos importantes:

- Campos já promovidos ao resumo superior são removidos dos grupos técnicos inferiores para evitar duplicidade
- Valores longos, como chaves de sessão em JSON, quebram dentro do contêiner em vez de estourar horizontalmente
- Caminhos absolutos verificados, como logs e arquivos de configuração, abrem a pré-visualização compartilhada ao clicar
- Caminhos de diretório, como o diretório de logs ou o diretório de trabalho do Agent da sessão atual, não abrem pré-visualização inline e vão direto para o gerenciador de arquivos do sistema
- A superfície de Environment agora combina diagnósticos do OpenClaw, ações de gerenciamento, ferramentas de configuração e detalhes de runtime em uma única vista

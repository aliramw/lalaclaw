[English](../en/documentation-interface.md) | [中文](../zh/documentation-interface.md) | [繁體中文（香港）](../zh-hk/documentation-interface.md) | [日本語](../ja/documentation-interface.md) | [한국어](../ko/documentation-interface.md) | [Français](../fr/documentation-interface.md) | [Español](../es/documentation-interface.md) | [Português](../pt/documentation-interface.md) | [Deutsch](../de/documentation-interface.md) | [Bahasa Melayu](../ms/documentation-interface.md) | [தமிழ்](../ta/documentation-interface.md)

[Voltar ao início](./documentation.md) | [Início rápido](./documentation-quick-start.md) | [Detalhe visual](./documentation-easter-egg.md) | [Conversa, anexos e comandos](./documentation-chat.md) | [Inspetor, pré-visualização de arquivos e rastreamento](./documentation-inspector.md)

# Visão geral da interface

A tela principal do LalaClaw pode ser entendida em três partes: o cabeçalho de controle de sessão, a área de chat e o inspetor à direita.

## Cabeçalho e controles de sessão

A parte superior inclui:

- Troca de modelo a partir da lista disponível
- Exibição do uso atual de contexto em relação ao máximo
- Um toggle de modo rápido
- Seleção do modo de pensamento entre `off / minimal / low / medium / high / xhigh / adaptive`
- Mudança de idioma para `中文 / 繁體中文（香港） / English / 日本語 / 한국어 / Français / Español / Português / Deutsch / Bahasa Melayu / தமிழ்`
- Mudança de tema `system / light / dark`
- Ajuda de atalhos no canto superior direito
- A lagosta clicável no canto superior esquerdo, descrita em [Detalhe visual](./documentation-easter-egg.md)

## Área de chat

O painel principal inclui:

- Uma faixa de abas para sessões de agente e conversas IM, além de um seletor para abrir outro agente ou outro fio IM
- Um cabeçalho com o agente atual, o estado de atividade, o tamanho da fonte e a ação de nova sessão
- Uma área de conversa para mensagens do usuário, respostas do assistente, streaming e prévias de anexos
- Um composer com texto, menções `@`, anexos e parada da resposta ativa

Comportamentos visíveis:

- Mensagens do usuário ficam à direita e mensagens do assistente à esquerda
- Enquanto a resposta está em andamento aparece primeiro um thinking placeholder temporário
- Respostas Markdown longas podem gerar um índice para saltar entre títulos
- Se você sair do final da conversa, aparece um botão para voltar ao mais recente

## Inspetor à direita

O inspetor agora expõe quatro superfícies principais:

- `Files`
- `Artifacts`
- `Timeline`
- `Environment`

Ele é acoplado à sessão ativa e reúne atividade de arquivos, resumos, registros de execução e metadados de runtime da mesma sessão.

## Abas de múltiplas sessões

As abas seguem algumas regras simples:

- Cada aba é identificada pela sessão real subjacente, isto é, `agentId + sessionUser`
- O seletor pode abrir tanto sessões de agente quanto conversas IM, como DingTalk, Feishu e WeCom
- Fechar uma aba apenas a oculta da visualização atual; o estado real da sessão não é apagado
- Abas de agente já abertas e canais IM já abertos ficam fora do seletor

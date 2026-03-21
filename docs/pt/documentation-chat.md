[English](../en/documentation-chat.md) | [中文](../zh/documentation-chat.md) | [繁體中文（香港）](../zh-hk/documentation-chat.md) | [日本語](../ja/documentation-chat.md) | [한국어](../ko/documentation-chat.md) | [Français](../fr/documentation-chat.md) | [Español](../es/documentation-chat.md) | [Português](../pt/documentation-chat.md) | [Deutsch](../de/documentation-chat.md) | [Bahasa Melayu](../ms/documentation-chat.md) | [தமிழ்](../ta/documentation-chat.md)

[Voltar ao inicio](./documentation.md) | [Visao geral da interface](./documentation-interface.md) | [Sessoes, agentes e modos de execucao](./documentation-sessions.md) | [Atalhos de teclado](./documentation-shortcuts.md) | [Persistencia local e recuperacao](./documentation-persistence.md)

# Conversa, anexos e comandos

O composer suporta dois modos de envio alternaveis:

- `Enter para enviar`
  - `Enter`: enviar
  - `Shift + Enter`: nova linha
- `Enter duplo para enviar`
  - Duplo `Enter`: enviar
  - `Shift + Enter`: enviar
  - `Enter`: nova linha

Nos dois modos:

- `ArrowUp / ArrowDown`: historico de prompts

A interface insere mensagem otimista, marcador de pensamento quando aplicavel e recebe resposta em NDJSON por streaming.

## Entrada por voz

- Em navegadores que expoem a API Web Speech, o composer mostra um botao de microfone ao lado dos controles de anexo e envio
- Um clique inicia o ditado e outro clique o interrompe. O texto reconhecido e inserido no rascunho atual em vez de ser enviado automaticamente
- Enquanto a entrada por voz estiver ativa, o botao pulsa e o composer mostra um estado ao vivo de escuta / transcricao
- Se o reconhecimento de voz nao estiver disponivel ou a permissao do microfone for negada, o composer mostra um estado de indisponibilidade ou erro em vez de falhar em silencio

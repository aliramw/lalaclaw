[English](../en/testing-e2e.md) | [Português](../pt/testing-e2e.md)

# Testes E2E de Navegador

Este guia define as expectativas de testes end-to-end em nível de navegador para o LalaClaw.

Use este documento junto com [CONTRIBUTING.md](../../CONTRIBUTING.md). `CONTRIBUTING.md` explica o fluxo geral de contribuição; este arquivo explica quando adicionar cobertura com Playwright, como mantê-la estável e o que o repositório espera hoje dos testes de navegador.

## Pilha atual

- Framework: Playwright
- Diretório de testes: `tests/e2e/`
- Configuração principal: [`playwright.config.js`](../../playwright.config.js)
- Script de bootstrap dos servidores de teste: [`scripts/playwright-dev-server.cjs`](../../scripts/playwright-dev-server.cjs)

A configuração atual inicia:

- servidor frontend em `http://127.0.0.1:5173`
- servidor backend em `http://127.0.0.1:3000`

O script de bootstrap do Playwright executa o backend em modo `COMMANDCENTER_FORCE_MOCK=1`, então os testes de navegador não dependem de um ambiente OpenClaw real por padrão.

## Quando o E2E de navegador é necessário

Adicione ou atualize cobertura e2e de navegador quando a mudança afetar uma ou mais destas áreas:

- comportamento de envio / stop / retry de mensagens
- turnos em fila e entrada atrasada na conversa
- bootstrap de sessão, troca de sessão ou roteamento de abas
- comportamento de hydration e recuperação que só aparece após uma renderização real
- regressões visíveis no navegador que são difíceis de confiar apenas com testes de hook ou controller

Prefira testes Vitest em nível de controller ou `App` para transições puras de estado. Adicione e2e de navegador quando o risco depender do timing real do DOM, do foco, do roteamento, da ordem de requisições ou de um fluxo UI em várias etapas.

## O que cobrir primeiro

O repositório não precisa de ampla cobertura de navegador antes de ter cobertura estável para os caminhos de usuário de maior risco.

Priorize estes fluxos:

1. inicialização da aplicação e primeiro render
2. um ciclo normal de envio / resposta
3. envios em fila ficando fora da conversa até o início do próprio turno
4. stop / abort durante uma resposta em andamento
5. caminhos de bootstrap de sessão, como abas IM ou troca de agent

Se um bug fix alterar fila, streaming, stop, hydration ou sincronização session/runtime, normalmente uma regressão de navegador deve mirar exatamente no modo de falha visível ao usuário.

## Regras de estabilidade

Os e2e de navegador devem ser escritos para estabilidade, não para detalhes visuais triviais.

- Prefira asserções sobre comportamento visível ao usuário em vez de detalhes internos de implementação
- Faça asserções sobre texto, roles, labels e controles estáveis
- Não faça o teste depender do tempo de animação, a menos que o bug seja sobre isso
- Evite asserções frágeis sobre classes Tailwind, a menos que a classe em si seja o comportamento testado
- Mantenha o comportamento de rede determinístico roteando as chamadas `/api/*` relevantes no teste
- Use interação real de navegador para digitação, clique, foco de aba e ordenação de requisições

Para fluxos de fila ou streaming, prefira verificar:

- se a mensagem está visível na região de conversa
- se ela continua apenas na região de fila
- se ela aparece somente após a conclusão do turno anterior
- se a ordem visível corresponde à ordem real dos turnos

## Estratégia de mock

Não envie os e2e de navegador para um deploy real do OpenClaw por padrão.

Ordem de preferência:

1. rotear as chamadas `/api/*` relevantes dentro do teste Playwright
2. usar o modo mock do backend do repositório
3. usar uma dependência externa real apenas quando a tarefa exigir explicitamente validação equivalente ao vivo

Os exemplos atuais em [`tests/e2e/chat-queue.spec.js`](../../tests/e2e/chat-queue.spec.js) seguem este padrão:

- `/api/auth/state` está stubbed
- `/api/lalaclaw/update` está stubbed
- `/api/runtime` está stubbed
- `/api/chat` é controlado por teste para manter determinísticos a ordem da fila e o tempo de conclusão

## Diretrizes de autoria

Mantenha cada e2e de navegador com escopo estreito.

- Um arquivo spec normalmente deve focar em uma única área do produto
- Um teste normalmente deve verificar um único fluxo de usuário
- Prefira um pequeno arquivo helper / fixture em vez de copiar JSON grandes em cada teste
- Reutilize builders de snapshot sempre que possível para manter alinhamento com `App.test.jsx`

Bons exemplos:

- "turnos em fila ficam fora da conversa até realmente começarem"
- "stop devolve o botão de envio após abortar uma resposta em andamento"
- "uma aba bootstrap do Feishu é resolvida para o session user nativo antes do primeiro envio"

Exemplos menos úteis:

- "o botão tem exatamente este conjunto de classes utilitárias"
- "três fluxos sem relação em um único teste"
- "usa um serviço remoto real mesmo quando um route mock já cobriria o comportamento"

## Execução local

Instale uma vez o navegador do Playwright:

```bash
npm run test:e2e:install
```

Execute os e2e de navegador:

```bash
npm run test:e2e
```

Execute com navegador visível:

```bash
npm run test:e2e:headed
```

Execute com a UI do Playwright:

```bash
npm run test:e2e:ui
```

## Expectativas de CI

A CI já tem um job dedicado para e2e de navegador em [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

Esse job deve permanecer focado e estável:

- mantenha a suite de navegador pequena o suficiente para rodar com confiabilidade em cada PR
- adicione primeiro regressões de alto valor antes de cenários exploratórios amplos
- evite waits flaky ou sleeps longos

Se um novo teste de navegador for lento demais ou sensível demais ao ambiente para a CI padrão, ele não deve entrar no caminho `test:e2e` antes de ser simplificado ou estabilizado.

## Checklist recomendada de review

Antes de fazer merge de uma mudança de e2e de navegador, verifique:

- isso realmente precisa de e2e de navegador, ou cobertura `App` / controller já basta?
- o teste verifica comportamento visível ao usuário em vez de detalhes de implementação?
- o estado de rede necessário está controlado de forma determinística?
- este teste ainda fará sentido daqui a seis meses se o estilo da UI mudar?
- o teste falha para a regressão de usuário que realmente queremos cobrir?

## Arquivos relacionados

- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [playwright.config.js](../../playwright.config.js)
- [tests/e2e/chat-queue.spec.js](../../tests/e2e/chat-queue.spec.js)
- [src/App.test.jsx](../../src/App.test.jsx)

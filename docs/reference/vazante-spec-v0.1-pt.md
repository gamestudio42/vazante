# Vazante: especificação para implementação

Oct 26, 2026 · @Marcel

## 1. Visão, escopo e convenções

Este documento especifica um RTS de sobrevivência zumbi para ser implementado por um agente de IA na stack do Urbe Oasis: TypeScript, pnpm, Vite, React, simulação determinística num Web Worker, Three.js no render e Electron no desktop. O nome de trabalho é **Vazante** (o termo em português para maré baixa, ebb tide).

**Fantasia central.** O jogador comanda a última força-tarefa naval e tenta salvar o que puder de uma cidade tomada por zumbis. Ele decide no mapa de operações e dá zoom em qualquer rua para lutar, sem tela de carregamento. Tudo o que acontece no zoom persiste no mapa.

**Pilares (nesta ordem de prioridade)**

1. Uma única simulação em duas escalas: mapa e batalha são vistas da mesma coisa.
2. A horda é massa: milhares de agentes, empilhamento, infecção.
3. Logística decide a guerra: munição e combustível só nas bases.
4. Perdas são permanentes: não se salva todo mundo.

**Convenções deste documento**

- **\[FATO\]** marca uma regra que esta especificação mantém. **\[EST\]** marca uma estimativa. Todo número sem marcação é \[EST\] e deve morar em `packages/shared/src/balance/` para ser ajustado.
- Unidades: distância em metros (m), tempo em segundos de jogo (s), velocidade em m/s.
- Nomes, cidade, facções e arte são próprios. A cidade do MVP é fictícia e procedural; equipamentos militares reais (Humvee, M777) podem ser citados por nome genérico.
- Placeholders de nome: a força-tarefa é **FT Âncora**, a mente-colmeia é **o Coro**, a cidade é **Porto Velário**.

**Fora do escopo desta especificação:** multiplayer, campanha global completa (só o gancho), geração de cidade a partir de dados reais e IA generativa em tempo de jogo.

## 2. Arquitetura e estrutura do repositório

O repositório novo copia a organização do Urbe Oasis: pacotes TypeScript expondo `src/index.ts` sem build, simulação pura e determinística no worker, UI React que só envia comandos e lê estado, e renderer que nunca altera a simulação. `kernel` e `bridge` podem ser copiados do Urbe Oasis (licença MIT, mesmo dono).

```text
vazante/
  apps/
    game/            Vite + React: shell, HUD, telas, host do worker, entrada
    desktop/         Electron: main process, preload, electron-builder (Steam, Flatpak, Snap, AppImage, Windows, macOS)
  packages/
    kernel/          RNG xoshiro128**, hash FNV-1a, fila de comandos, tick runner, envelope de save (copiado)
    bridge/          clock do worker e RPC (copiado)
    shared/          tipos, comandos, protocolo do worker, schemas de save, balance/*.ts
    simulation/      engine: world, systems/*, commands, persistence, scenarios
    citygen/         gerador procedural da cidade (ruas, quarteirões, prédios, distritos) — puro e determinístico
    view3d/          Three.js: cena, câmera contínua, render low-res, instancing, LOD, picking
    chrome/          store, boot, toasts, i18n, áudio, IndexedDB (adaptado do Urbe Oasis)
    theme/           paletas e tokens; o jogo nunca contém cores fixas
  tools/             headless-sim.ts, benchmark.ts, render-benchmark.ts
  tests/             unit, scenarios, e2e (Playwright)
  docs/              architecture.md, simulation-spec.md, balancing.md, roadmap.md
  AGENTS.md
```

**Topologia em tempo de execução**

- **Worker (autoridade):** `SimulationEngine` com `enqueue(cmd)`, `tick()`, `runTicks(n)`, `serialize()`, `fromSnapshot()`. Roda em passo fixo; o clock converte tempo real em ticks segundo a velocidade (pausa, 1x, 2x, 4x).
- **Main thread:** `GameClient` mantém um espelho de leitura. Recebe deltas a cada tick: entidades alteradas, estados de distrito, eventos. As posições da horda chegam por um buffer binário separado (ver seção 4).
- **Renderer (`view3d`):** lê o espelho e o buffer da horda, interpola entre os dois últimos ticks e desenha. Não tem regra de jogo.
- **UI (React):** HUD e painéis assinam fatias do store. Comandos passam por um `ToolController`, que valida com as mesmas funções puras da engine antes de enviar.

**Determinismo (igual ao Urbe Oasis)**

- Um RNG semeado na engine; proibidos `Math.random`, `Date`, `performance` e funções transcendentais (`sin`, `cos`, `atan2`, `exp`, `log`) no pacote `simulation`. Permitidos `+ - * /`, `Math.sqrt`, `floor`, `round`, `min`, `max`, `abs`, `imul`, `trunc`.
- Ângulos são vetores unitários ou índices de 16 direções com tabela de seno e cosseno pré-calculada em `balance/trig.ts`.
- Iteração sempre por índice ou ordem de inserção. `hashState(engine)` é o oráculo dos testes de determinismo e de save e load.

**Desktop**

- Electron carrega o mesmo `apps/game/dist` por protocolo customizado (`app://`), com `contextIsolation` ligado e sem `nodeIntegration`.
- O preload expõe só `window.vazanteNative` com: salvar e carregar arquivo, conquistas Steam (via steamworks.js, opcional se o cliente Steam não estiver presente) e sair.
- Cabeçalhos COOP e COEP são injetados no protocolo `app://` para habilitar `SharedArrayBuffer`.
- electron-builder gera: Windows NSIS, macOS dmg, Linux AppImage, Snap e Flatpak. Steam recebe o diretório desempacotado via SteamPipe (fora do CI no MVP).

## 3. Modelo de dados

O mundo é um grid de células de 4 m guardado como structure of arrays, como no Urbe Oasis. Entidades discretas (unidades, veículos, estruturas, comboios) ficam em tabelas com id inteiro. Zumbis individuais ficam num pool de arrays tipados, e zumbis agregados ficam como densidade por célula de setor.

**Escalas espaciais \[EST\]**

| Nível | Tamanho | Uso |
| --- | --- | --- |
| Célula | 4 x 4 m | navegação, ocupação, flow field, construção |
| Setor | 64 x 64 m (16 x 16 células) | horda agregada, fog of war do mapa, chunk de render e de simulação |
| Distrito | 6 a 12 setores | estado Hold, Crisis, Lost; população civil; UI do mapa |
| Cidade (MVP) | 2.048 x 2.048 m = 512 x 512 células = 32 x 32 setores | 4 a 6 distritos |

**Camadas do grid (512 x 512)**

| Camada | Tipo | Significado |
| --- | --- | --- |
| `ground` | `Uint8Array` | 0 rua, 1 calçada, 2 lote vazio, 3 prédio, 4 água, 5 parque |
| `buildingId` | `Int32Array` | prédio que ocupa a célula, 0 = nenhum |
| `height` | `Uint8Array` | altura do topo em metros (0 a 255), usada para telhados e linha de visão |
| `blocked` | `Uint8Array` | bits: 1 parede de estrutura, 2 portão fechado, 4 escombro, 8 veículo destruído |
| `pile` | `Uint8Array` | altura da pilha de zumbis encostada numa parede, em camadas de 0,5 m (0 a 20) |
| `fieldTarget` | `Uint16Array` | distância do flow field até o alvo humano mais próximo, em células (65535 = inalcançável) |
| `noise` | `Uint8Array` | ruído acumulado (tiros, explosões), decai por tick |
| `visible` | `Uint8Array` | 0 nunca visto, 1 visto antes, 2 visível agora |

**Tipos principais (em `packages/shared`)**

```ts
type EntityId = number; // inteiro > 0, nunca reutilizado dentro de um save

interface District {
  id: number; name: string; sectors: number[];
  state: 'hold' | 'crisis' | 'lost';
  civilians: number;          // população viva não evacuada
  infectedCivilians: number;  // infectados ainda não transformados
  pressure: number;           // 0..1000, ver regra de estado do distrito
}

interface Squad {
  id: EntityId; faction: 'player' | 'allied';
  kind: 'guard' | 'police' | 'marines';
  members: Soldier[];         // 4 a 12
  order: Order; stance: 'hold' | 'aggressive' | 'defensive' | 'withdraw';
  formation: 'line' | 'column' | 'wedge' | 'circle';
  baseId: EntityId | null;    // base de reabastecimento
}

interface Soldier {
  id: EntityId; x: number; y: number; z: number; // metros
  hp: number; ammo: number; weapon: WeaponId;
  state: 'ok' | 'wounded' | 'bitten' | 'dead' | 'turned';
  bittenAt: number | null;    // tick da mordida
  controlledByPlayer: boolean;
}

interface Vehicle {
  id: EntityId; kind: VehicleKind; x: number; y: number; z: number;
  heading: number;            // índice 0..15
  hp: number; fuel: number; ammo: Record<WeaponId, number>;
  cargo: Cargo; crew: EntityId[]; passengers: EntityId[];
  order: Order;
}

interface Structure {
  id: EntityId; kind: StructureKind; baseId: EntityId;
  cells: number[]; hp: number; built: number; // 0..1 progresso de construção
  ammo?: number; open?: boolean;
}

interface Base {
  id: EntityId; name: string; districtId: number;
  stock: { ammo: number; fuel: number; materials: number; food: number };
  structures: EntityId[]; refugees: number;
}

interface Convoy {
  id: EntityId; vehicles: EntityId[]; route: number[]; // índices de célula
  from: EntityId; to: EntityId; cargo: Cargo; status: 'moving' | 'ambushed' | 'arrived' | 'lost';
}

interface Cargo { ammo: number; fuel: number; materials: number; troops: EntityId[]; refugees: number }

interface FireSupportAsset {
  id: string; kind: 'artillery' | 'rocket' | 'naval_gun' | 'cruise_missile' | 'airstrike' | 'gunship';
  magazine: number; cooldownUntil: number; rangeFrom: EntityId | 'fleet';
}

interface HiveDirective { // a IA estratégica, "o Coro"
  id: EntityId; kind: 'ambush_convoy' | 'cut_road' | 'siege_base' | 'hunt_unit' | 'surge_district';
  target: EntityId | number; warnAt: number; executeAt: number; strength: number;
}

type Order =
  | { kind: 'idle' } | { kind: 'move'; to: [number, number] }
  | { kind: 'hold'; at: [number, number] } | { kind: 'delay'; line: [number, number][] }
  | { kind: 'withdraw'; to: EntityId } | { kind: 'escort'; convoy: EntityId }
  | { kind: 'board'; vehicle: EntityId } | { kind: 'fastrope'; at: [number, number] };
```

**Pool de zumbis individuais (capacidade 16.384) \[EST\]**

| Campo | Tipo | Significado |
| --- | --- | --- |
| `zx`, `zy`, `zz` | `Float32Array` | posição em metros |
| `zvx`, `zvy` | `Float32Array` | velocidade |
| `zhp` | `Uint8Array` | vida |
| `zstate` | `Uint8Array` | 0 livre, 1 vagando, 2 perseguindo, 3 atacando, 4 empilhado, 5 agarrado em aeronave, 6 morto (cadáver) |
| `zkind` | `Uint8Array` | 0 comum, 1 corredor, 2 robusto (ver balanceamento) |
| `zsector` | `Uint16Array` | setor atual, para o LOD |

**Horda agregada:** `sectorDensity: Uint16Array` com o número de zumbis abstratos por setor, mais `sectorDrift: Int8Array` (x, y) com a direção média de movimento.

**Save:** envelope do kernel (`vazante-save`, versão, checksum FNV), camadas em base64, tabelas como JSON. Migrações são funções puras por versão.

## 4. Simulação: tick, escalas e nível de detalhe

A simulação roda a 10 ticks por segundo de jogo em todas as escalas; o que muda com o zoom é só o nível de detalhe de cada setor, nunca as regras. \[FATO\] O jogo não tem auto-resolve escondido: o que acontece fora da tela tem de ser coerente com o que aconteceria na tela.

**Tick**

- `TICK_DT = 0,1 s` de jogo. Velocidades: pausa, 1x (10 ticks/s real), 2x, 4x \[FATO: até 4x\].
- O worker roda no máximo 8 ticks por frame real; se não der conta no 4x, a velocidade efetiva cai e a UI mostra o aviso "simulação limitada".
- Ordem fixa dos sistemas em cada tick:
  1. Aplicar comandos da fila (em ordem de chegada).
  2. `hive` (diretivas do Coro, a cada 50 ticks).
  3. `lod` (promover e rebaixar setores).
  4. `flowfield` (recalcular setores sujos, orçamento de 4 setores por tick).
  5. `hordeAggregate` (setores abstratos, a cada 10 ticks).
  6. `hordeAgents` (zumbis individuais).
  7. `units` (ordens, movimento, formações).
  8. `combat` (mira, tiro, dano, mordidas).
  9. `fireSupport` (projéteis em voo e impactos).
  10. `infection` (mordidos que viram zumbis).
  11. `logistics` (comboios, consumo, reabastecimento).
  12. `construction`.
  13. `districts` (pressão e estado, a cada 50 ticks).
  14. `visibility` (a cada 5 ticks).
  15. `events` (gerar deltas e eventos para a UI).

**Nível de detalhe por setor \[EST\]**

Cada setor está em um de três níveis. O nível é decidido pela câmera e pela presença de unidades do jogador, nunca só pela câmera, para que a batalha fora da tela continue justa.

| Nível | Quando | Zumbis | Unidades |
| --- | --- | --- | --- |
| L0 abstrato | sem unidades do jogador num raio de 2 setores e fora da câmera | `sectorDensity` com difusão e deriva | posição por setor, combate por fórmula (abaixo) |
| L1 agentes simplificados | unidades do jogador no setor ou vizinhas, câmera longe | agentes individuais com flow field, sem empilhamento físico | soldados individuais, tiro por chance |
| L2 agentes completos | setor dentro do frustum com câmera abaixo de 300 m de altura | agentes com separação, empilhamento, agarrar aeronaves | igual a L1 mais efeitos visuais |

- **Promover L0 para L1:** gerar `sectorDensity` agentes em posições pseudo-aleatórias (RNG da engine) em células livres do setor, com velocidade na direção de `sectorDrift`. Se o pool estiver cheio, o setor fica em L0 e um contador é incrementado para o benchmark.
- **Rebaixar L1 para L0:** somar os agentes vivos em `sectorDensity` e liberar os slots. Histerese de 30 ticks para evitar oscilação.
- **Conservação:** a soma de zumbis (agentes + densidade) só muda por morte, infecção ou spawn do Coro. Teste obrigatório.

**Combate em L0 (fórmula de Lanchester linear) \[EST\]**

Por setor e a cada 10 ticks, com `F` = poder de fogo do jogador no setor (soma de `dps` das armas com munição) e `Z` = zumbis no setor:

```text
zumbisMortos   = floor(F * 1,0 s * EFICIENCIA_L0)          // EFICIENCIA_L0 = 0,6
contatos       = min(Z, soldadosNoSetor * 3)
mordidas       = floor(contatos * CHANCE_MORDIDA_L0 * fatorDefesa) // CHANCE_MORDIDA_L0 = 0,02
fatorDefesa    = 0,3 atrás de muro intacto, 0,6 em veículo, 1,0 a céu aberto
municaoGasta   = tirosPorSegundo * 1,0 s
```

A fórmula deve ser calibrada contra L2: o teste de cenário roda o mesmo combate em L0 e L2 com 10 sementes e exige que as baixas fiquem dentro de ±25%.

**Buffer da horda para o render**

- A cada tick, o worker escreve num `SharedArrayBuffer` (ou transfere um `ArrayBuffer` quando SAB não existir): `count`, depois `x, y, z, heading, animState` por agente visível em L2, em `Float32` e `Uint8`.
- Dois buffers alternados (double buffering) e um índice atômico do buffer pronto.
- O render interpola entre os dois últimos ticks usando o tempo desde o último tick.

## 5. Sistemas e regras

Cada sistema abaixo é um módulo em `packages/simulation/src/systems/`, com uma função `step(world, ctx)` e testes unitários próprios. Os números citados estão na seção 6.

### 5.1 Horda (agentes)

- **Flow field:** campo de distância (BFS de 8 vizinhos, custo 10 ortogonal e 14 diagonal) a partir de todas as células com humanos visíveis para zumbis ou com ruído acima de 40. Células `blocked` têm custo infinito, exceto paredes com `pile` alto o bastante (5.3). Um campo por setor ativo, recalculado quando um alvo muda de célula ou uma parede muda; orçamento de 4 setores por tick.
- **Estados:** vagando (segue `sectorDrift` com ruído de RNG), perseguindo (desce o flow field), atacando (alvo a menos de 1,2 m), empilhado, agarrado, morto.
- **Percepção:** um zumbi passa de vagando para perseguindo se um humano estiver a menos de 25 m em linha de visão ou se `noise` da célula passar de 40. Tiro gera ruído 60 num raio de 40 m; explosão gera 200 num raio de 150 m. Ruído decai 10% por tick.
- **Movimento:** velocidade desejada = direção do flow field vezes a velocidade do tipo. Separação com vizinhos num hash espacial de célula (raio 0,6 m, no máximo 6 vizinhos checados). Aceleração limitada a 4 m/s².
- **Zumbis entram em prédios?** Não no MVP; prédios são sólidos, telhados são alcançados por empilhamento.

### 5.2 Combate

- **Aquisição de alvo:** cada soldado escolhe o zumbi visível mais próximo dentro do alcance da arma, reavaliando a cada 5 ticks. Postura `hold` atira só no setor de 90° à frente da formação.
- **Acerto:** `chance = precisaoArma * fatorDistancia * fatorPostura`, com `fatorDistancia = 1 - (d / alcance)^2 * 0,5` e `fatorPostura` 1,0 parado, 0,6 em movimento. Rolagem com o RNG da engine.
- **Dano:** acerto tira `dano` de `zhp`. Armas de área aplicam dano a todos num raio, com queda linear até a borda.
- **Ataque zumbi:** a cada 1,0 s em contato, um zumbi causa 8 de dano e tem chance de mordida de 15% contra soldado a pé. Contra veículo causa 2 de dano, sem mordida. Veículos atropelam: zumbi atingido acima de 5 m/s morre.
- **Munição:** cada tiro gasta 1 da arma do soldado. Com 0, o soldado não atira e o esquadrão emite o evento `out_of_ammo`.

### 5.3 Empilhamento em paredes \[FATO: zumbis se empilham para subir muros e telhados\]

- Quando um zumbi perseguindo não avança porque a próxima célula é parede, ele vira `empilhado` e incrementa `pile` daquela célula de parede em 1 (0,5 m).
- Uma parede de altura `h` vira transponível quando `pile * 0,5 >= h`. A partir daí, o custo daquela célula no flow field passa a ser normal e zumbis passam por cima (com `zz` subindo).
- Zumbis empilhados mortos reduzem `pile` em 1. Sem pressão, `pile` decai 1 a cada 20 ticks.
- Render: os empilhados são desenhados como uma rampa de corpos encostada na parede (instâncias com `zz` crescente).

### 5.4 Infecção \[FATO: soldados mortos pela horda voltam como zumbis\]

- Soldado mordido vira `bitten`. Após `TEMPO_TRANSFORMACAO` (60 a 180 s, sorteado), vira `turned`: sai do esquadrão e um zumbi nasce na posição dele.
- Soldado morto por zumbi vira zumbi depois de 20 s se o corpo não for destruído. Morto por explosão não volta.
- Civis seguem a mesma regra. Na triagem de quarentena (5.10), suspeitos têm 20% de chance de estarem infectados \[EST\].

### 5.5 Unidades e ordens

- Unidade de comando é o esquadrão (4 a 12 soldados) ou o veículo. Ordens da seção 3: `move`, `hold`, `delay` (recua até a próxima linha quando a pressão passar de 70%), `withdraw`, `escort`, `board`, `fastrope`.
- **Formações:** posições-alvo relativas ao líder; espaçamento 2 m. `circle` serve para defesa parada.
- **Pathfinding:** A\* no grid de células com cache por par de setores; veículos usam só células de rua.
- **Helicópteros:** voam a 40 m de altura ignorando o grid. Pousam só em célula livre de 3 x 3 (rua, praça ou telhado plano). `fastrope`: paira a 10 m por 8 s e desce até 8 soldados.
- **Agarrar aeronave \[FATO\]:** helicóptero abaixo de 6 m sobre zumbis permite que até 6 se agarrem; cada um adiciona 5% de massa e 1 de dano por segundo. Acima de 4 agarrados, o helicóptero perde altitude e cai se não subir em 5 s.

### 5.6 Controle direto \[FATO: tecla TAB\]

- TAB na unidade selecionada liga o controle direto de um soldado, veículo ou helicóptero. A câmera vai para terceira pessoa a 12 m atrás e 8 m acima. A simulação continua igual; o jogo só troca a origem dos comandos dessa unidade.
- Soldado: WASD move, mouse mira, botão esquerdo atira com a mesma precisão da regra 5.2 mais um bônus de 0,2. Veículo: WASD dirige, mouse mira a torre. Helicóptero: WASD movimento horizontal, Q e E altitude.
- No controle direto, a velocidade máxima é 1x e a pausa é desativada. TAB de novo devolve o controle à IA da unidade.

### 5.7 Visibilidade \[FATO: hordas só aparecem dentro da linha de visão\]

- Cada unidade revela células num raio (soldado 40 m, veículo 50 m, helicóptero 150 m, drone 300 m) com raycast simples contra `height`.
- No mapa, um setor fora da visão mostra só a última densidade vista, com a idade em minutos.

### 5.8 Fogo de apoio \[FATO: lista de armas e paiol finito\]

- Pedido: escolher ativo e ponto (ou linha, no caso de ataque aéreo). Validações: alcance, paiol maior que zero, cooldown, fogo amigo (aviso se houver unidade do jogador a menos do raio de segurança).
- Fluxo: pedido, atraso, impacto. Durante o atraso, um marcador aparece no mapa e na batalha.
- Dano em área mata zumbis e fere humanos. Prédios recebem dano estrutural; com hp 0 viram escombro (`blocked` bit 4) e matam quem estiver dentro do raio.

### 5.9 Base, construção e logística

- Base é criada numa área livre de 24 x 24 células, com um centro de comando. Estruturas são colocadas em células da base e precisam de materiais no estoque.
- Construção progride quando há pelo menos 2 soldados (ou 1 engenheiro) a menos de 10 m: `built += 1 / tempoConstrucao` por segundo.
- **Consumo:** soldados gastam munição ao atirar; veículos gastam combustível por metro; base gasta comida por refugiado por hora de jogo.
- **Reabastecimento \[FATO: só nas bases\]:** esquadrão a menos de 30 m do depósito de munição recarrega 10 tiros por soldado por segundo; veículo no ponto de combustível recebe 5% por segundo.
- **Comboios:** caminhões levam carga por rota de rua; helicópteros levam carga suspensa sem rota. Carga máxima na seção 6. Comboio atacado vira `ambushed` e emite evento; caminhão destruído perde a carga.

### 5.10 Distritos e civis

- **Pressão (0 a 1000)**, recalculada a cada 5 s:

```text
pressao += (zumbisNoDistrito / 50) - (poderDeFogoDoJogador / 20) - (estruturasDefensivas * 2)
pressao  = clamp(pressao, 0, 1000)
estado   = hold se pressao < 300; crisis se 300..799; lost se >= 800
```

- Em `crisis`, 0,5% dos civis viram zumbis por minuto. Em `lost`, 3% por minuto; um distrito `lost` só volta a `crisis` se a pressão ficar abaixo de 500 por 2 minutos.
- **Evacuação:** civis são levados por comboio até uma base ou até o porto. Na chegada, triagem de quarentena: o jogador escolhe isolar (ocupa capacidade e comida por 3 minutos), liberar (risco de surto dentro da base) ou executar suspeitos \[FATO: a escolha existe; deixar configurável e com aviso de conteúdo\].

### 5.11 O Coro (IA estratégica) \[FATO: embosca comboios, corta estradas, cerca bases, caça unidades isoladas, com aviso prévio\]

- A cada 5 s, o Coro pontua alvos e cria no máximo 1 diretiva nova se tiver "vontade" suficiente:

```text
vontade += 1 por segundo (teto 100)
score(comboio)   = valorCarga / 10 + 20 se a rota passa por setor com densidade > 200
score(base)      = 30 + refugiados / 5 - estruturasDefensivas * 3
score(unidade)   = 40 se unidade isolada (nenhuma aliada a 150 m) e com munição < 30%
custo(diretiva)  = forca / 20
cria a diretiva de maior score se score > 25 e vontade >= custo
```

- Cada diretiva tem `warnAt` (aviso ao jogador, 20 a 40 s antes) e `executeAt`. Executar = deslocar `sectorDensity` dos setores vizinhos para o alvo, ou fazer surgir zumbis de dentro de prédios (spawn limitado a 10% do total do distrito).
- `cut_road`: marca células de rua como bloqueadas por veículos destruídos.

### 5.12 Fim de partida e campanha

- **Vitória do cenário:** evacuar pelo menos 30% da população inicial ao porto e embarcar no navio. **Derrota:** perder todas as bases ou o porto.
- **Gancho da campanha \[FATO\]:** o que chega ao porto (tropas, veículos, refugiados, estoques) vira o estado inicial da próxima região. No MVP isso é só uma tela de resumo que grava esse estado no save.

## 6. Tabelas de balanceamento

Todos os valores são \[EST\] e moram em `packages/shared/src/balance/*.ts`, um arquivo por tabela. O ponto de partida busca uma sensação: um esquadrão da Guarda Nacional parado e sem ser alcançado mata cerca de 700 zumbis comuns antes de ficar sem munição, mas cai em menos de 1 minuto se 30 zumbis chegarem ao contato.

**Zumbis (`balance/zombies.ts`)**

| Tipo | Vida | Velocidade (m/s) | Dano por golpe | Chance de mordida | Proporção |
| --- | --- | --- | --- | --- | --- |
| Comum | 30 | 1,4 | 8 | 15% | 85% |
| Corredor | 20 | 4,0 | 6 | 15% | 10% |
| Robusto | 120 | 1,0 | 20 | 10% | 5% |

**Armas (`balance/weapons.ts`)**

| Arma | Alcance (m) | Tiros/s | Dano | Precisão | Raio de área (m) | Munição por soldado |
| --- | --- | --- | --- | --- | --- | --- |
| Fuzil | 60 | 2 | 34 | 0,55 | 0 | 210 |
| Metralhadora leve | 80 | 8 | 30 | 0,35 | 0 | 600 |
| Espingarda (polícia) | 15 | 1 | 60 por projétil, 6 projéteis | 0,5 | 0 | 40 |
| Metralhadora .50 (veículo) | 150 | 8 | 80 | 0,4 | 0 | 1.200 |
| Canhão 25 mm (blindado) | 300 | 3 | 120 | 0,6 | 2 | 600 |
| Canhão 120 mm (tanque) | 400 | 0,15 | 400 | 0,8 | 8 | 40 |
| Canhão 30 mm (helicóptero de ataque) | 500 | 10 | 100 | 0,4 | 3 | 1.200 |

**Esquadrões (`balance/units.ts`)**

| Tipo | Soldados | Vida por soldado | Arma | Velocidade (m/s) | Custo de convocação |
| --- | --- | --- | --- | --- | --- |
| Guarda Nacional | 8 | 100 | 7 fuzis, 1 metralhadora leve | 3,0 | já disponível |
| Polícia | 6 | 80 | 4 espingardas, 2 fuzis | 3,2 | já disponível |
| Fuzileiros | 10 | 120 | 8 fuzis, 2 metralhadoras leves | 3,0 | reforço a cada 6 minutos |

**Veículos (`balance/vehicles.ts`)**

| Veículo | Vida | Velocidade (m/s) | Armas | Passageiros | Carga | Combustível por km |
| --- | --- | --- | --- | --- | --- | --- |
| Utilitário leve (Humvee) | 400 | 20 | .50 | 4 | 0,5 t | 2% |
| Blindado de rodas (LAV) | 900 | 18 | 25 mm | 6 | 0 | 3% |
| Blindado de esteira (Bradley) | 1.200 | 12 | 25 mm | 6 | 0 | 4% |
| Tanque | 3.000 | 11 | 120 mm e .50 | 0 | 0 | 6% |
| Caminhão de carga (hooklift) | 500 | 15 | nenhuma | 2 | 8 t ou 20 refugiados | 3% |
| Helicóptero de transporte | 600 | 50 | 2 metralhadoras leves | 11 | 4 t suspensas | 5% |
| Helicóptero de ataque | 800 | 60 | 30 mm e foguetes | 0 | 0 | 6% |

**Fogo de apoio (`balance/support.ts`)**

| Ativo | Atraso (s) | Raio (m) | Dano | Paiol inicial | Recarga (s) | Alcance |
| --- | --- | --- | --- | --- | --- | --- |
| Obuseiro 155 mm (bateria) | 25 | 25 | 600 | 60 tiros | 10 entre salvas | 20 km da base |
| Lançador de foguetes | 40 | 60 | 1.000 | 12 | 60 | 60 km |
| Canhão naval 5" | 20 | 20 | 500 | 300 | 3 | 20 km do navio |
| Míssil de cruzeiro | 90 | 80 | 3.000 | 8 | 120 | cidade inteira |
| Ataque aéreo (caça) | 60 | linha de 200 x 30 | 800 | 12 surtidas | 180 | cidade inteira |
| Avião canhoneiro (órbita) | 45 | 15 por disparo | 200 | 1 órbita de 120 s | 600 | cidade inteira |
| Drone (órbita de visão) | 30 | visão 300 | 0 | 2 órbitas de 300 s | 300 | cidade inteira |

**Estruturas (`balance/structures.ts`)**

| Estrutura | Tamanho (células) | Altura (m) | Vida | Materiais (t) | Tempo de construção (s) | Efeito |
| --- | --- | --- | --- | --- | --- | --- |
| Barreira HESCO | 1 x 1 | 2,0 | 800 | 0,5 | 10 | bloqueia, transponível com pilha de 4 |
| Muro de concreto | 1 x 1 | 3,5 | 2.000 | 1,5 | 20 | bloqueia, transponível com pilha de 7 |
| Portão | 2 x 1 | 3,5 | 1.200 | 1,0 | 20 | abre e fecha por comando |
| Andaime | 1 x 1 | 3,0 | 200 | 0,3 | 8 | soldados atiram de cima do muro |
| Ninho de metralhadora | 2 x 2 | 1,5 | 600 | 1,0 | 15 | 1 metralhadora leve fixa, alcance +20% |
| CIWS | 2 x 2 | 3,0 | 800 | 3,0 | 60 | canhão rápido automático, 50 tiros/s, alcance 100 m, 3.000 tiros |
| Poço de morteiro | 2 x 2 | 0 | 400 | 1,0 | 20 | fogo indireto 50 a 1.500 m, raio 10 m |
| Depósito de munição | 3 x 3 | 2,5 | 600 | 2,0 | 30 | ponto de recarga, capacidade 50.000 tiros |
| Ponto de combustível | 3 x 3 | 2,0 | 400 | 2,0 | 30 | reabastece veículos, capacidade 20.000 L |
| Torre de iluminação | 1 x 1 | 8,0 | 150 | 0,3 | 8 | ilumina 40 m à noite (visão normal) |

**Mundo e IA (`balance/world.ts`)**

| Constante | Valor |
| --- | --- |
| Zumbis iniciais na cidade do MVP | 60.000 (o original fala em "um milhão" para LA) |
| Civis iniciais | 40.000 |
| Capacidade do pool de agentes | 16.384 |
| Ciclo dia e noite | 20 minutos de jogo; à noite a visão cai 50% sem iluminação |
| Intervalo de diretivas do Coro | 5 s; máximo de 3 ativas |
| Aviso antes de um ataque do Coro | 20 a 40 s |

## 7. Estados do jogo e controles

O jogo tem uma máquina de estados de tela simples; dentro da partida, a câmera é contínua e o "modo" (mapa ou batalha) é só uma faixa de altura da câmera.

**Estados de tela**

| Estado | Entra por | Sai para |
| --- | --- | --- |
| `boot` | abrir o app | `menu` quando gráficos, worker e cidade de fundo estão prontos |
| `menu` | boot, fim de partida, sair da partida | `briefing` (novo jogo), `game` (carregar), `settings` |
| `briefing` | novo jogo | `game` |
| `game` | briefing ou carregar | `menu`, `summary` |
| `summary` | vitória ou derrota | `menu` |
| `settings` | menu ou pausa | estado anterior |

**Faixas de câmera dentro de `game` \[EST\]**

| Altura da câmera | Vista | O que aparece |
| --- | --- | --- |
| acima de 1.200 m | mapa de operações | distritos coloridos por estado, ícones de unidades, rotas, densidade da horda como mapa de calor; projeção ortográfica de cima |
| 300 a 1.200 m | transição | prédios em LOD baixo aparecem, ícones encolhem, inclinação vai de 90° a 55° |
| 40 a 300 m | batalha | cena 3D completa em pixel art, zumbis individuais, HUD tático |
| controle direto | terceira pessoa | 12 m atrás e 8 m acima da unidade |

A rolagem do mouse muda a altura de forma exponencial (cada clique multiplica por 0,85 ou 1,18), com interpolação de 150 ms. Não há carregamento: o streaming de setores (seção 9) precisa acompanhar.

**Controles padrão (remapeáveis)**

| Ação | Teclado e mouse |
| --- | --- |
| Mover câmera | WASD, setas ou arrastar com botão do meio |
| Zoom | roda do mouse |
| Girar câmera (batalha) | Q e E, ou Alt + arrastar |
| Selecionar | clique esquerdo; arrastar para caixa; duplo clique seleciona todos do tipo visíveis |
| Ordem contextual | clique direito (mover, atacar, embarcar, escoltar conforme o alvo) |
| Grupos | Ctrl + 1 a 9 cria; 1 a 9 seleciona; duas vezes centraliza |
| Pausa | Espaço |
| Velocidade | F1, F2, F3 para 1x, 2x, 4x |
| Postura | Z segurar, X agressiva, C defensiva, V recuar |
| Formação | F alterna linha, coluna, cunha, círculo |
| Fogo de apoio | B abre o menu; clique escolhe o ponto; Esc cancela |
| Construir | G abre o menu da base |
| Controle direto | TAB \[FATO\] |
| Mapa e batalha rápido | M alterna entre a altura atual e a vista de mapa |
| Ir para alerta | Home vai para o alerta mais recente |

Gamepad e Steam Deck ficam fora do MVP, mas a entrada deve passar por uma camada de ações (`InputAction`) para facilitar o suporte depois.

## 8. Telas e UI

A UI é React sobre o canvas, com o mesmo padrão do Urbe Oasis: um painel flutuante por vez, Esc fecha o painel antes de cancelar a ferramenta, e todo texto vem de `i18n` (en e pt-BR no MVP; inglês é a fonte dos tipos).

| Tela ou elemento | Conteúdo | Observações |
| --- | --- | --- |
| Boot | logo, etapa atual, barra de progresso | igual ao Urbe Oasis |
| Menu principal | Novo jogo, Continuar, Carregar, Configurações, Sair (só desktop) | cidade de fundo simulando em modo atração, câmera derivando |
| Briefing | semente, dificuldade (afeta zumbis iniciais e vontade do Coro), aviso de conteúdo, opção de desligar a execução na triagem |  |
| Barra superior | relógio do jogo e dia ou noite, velocidade, totais: soldados, civis salvos, munição e combustível somados das bases, paiol da frota | sempre visível |
| Lista de distritos (esquerda) | nome, estado com cor do tema, pressão, civis restantes | clique centraliza |
| Feed de alertas (direita) | avisos do Coro com contagem regressiva, comboio atacado, sem munição, distrito caiu | clique leva ao local; Home vai ao mais recente |
| Painel de seleção (baixo) | retrato ou ícone, vida, munição, combustível, ordem atual, botões de postura e formação | vários selecionados mostram uma grade |
| Menu de fogo de apoio | lista de ativos com paiol, recarga, atraso e alcance; ativos fora de alcance ficam desabilitados com motivo | B |
| Menu de construção | estruturas com custo em materiais e tempo; prévia fantasma verde ou vermelha | G, só dentro da base |
| Painel de base | estoques, refugiados, fila de construção, botão Novo comboio |  |
| Planejador de comboio | origem, destino, veículos, carga, rota sugerida com setores de risco destacados |  |
| Triagem de quarentena | número de chegados, suspeitos, opções isolar, liberar, executar (se habilitado) | pausa o jogo |
| Minimapa | distritos, unidades, retângulo da vista | some na vista de mapa |
| HUD de controle direto | mira, munição, vida, "TAB para sair" | esconde o resto do HUD |
| Resumo | resultado, civis salvos, baixas, zumbis mortos, o que embarcou (gancho de campanha) |  |
| Configurações | volume, idioma, escala de resolução interna, limite de agentes, teclas |  |

**Mapa de operações:** distritos como polígonos preenchidos (verde Hold, âmbar Crisis, vermelho Lost, cores do tema), densidade da horda como mapa de calor por setor só onde há visão, ícones de unidade no padrão militar simplificado, rotas de comboio como linhas tracejadas e diretivas do Coro como marcadores pulsantes com contagem regressiva.

## 9. Render, áudio e assets

O visual é 3D em pixel art \[FATO\]: a cena é renderizada numa resolução interna baixa e ampliada com filtro nearest. Toda a arte do MVP pode ser procedural ou low-poly simples, porque a resolução baixa esconde detalhe.

**Pipeline de render (`packages/view3d`)**

1. Three.js com `WebGPURenderer` e fallback automático para WebGL2.
2. Render target interno com altura de 270 px (configurável de 180 a 540), largura pela proporção da tela; upscale por fator inteiro com nearest.
3. Câmera ortográfica na batalha (inclinação 55°, girando em passos de 45° ou livre) com snap de posição ao texel para evitar tremido; ortográfica de cima no mapa.
4. Iluminação: uma luz direcional e uma ambiente, toon shading de 3 faixas, sombras só da luz direcional em mapa de 1.024.
5. Pós-processamento em um passe: outline por diferença de profundidade e normal, quantização para a paleta do tema, dithering ordenado leve.
6. Prédios: geometria de caixas por prédio gerada pelo `citygen`, unidas por setor em uma malha; três LODs (caixa simples, caixa com telhado, caixa com janelas por textura).
7. Zumbis: um `InstancedMesh` por tipo, até 16.384 instâncias; animação por textura de vértices (VAT) com 4 clipes (andar, correr, atacar, cair), 6 quadros cada. Atributos por instância: posição, direção, clipe, fase.
8. Soldados e veículos: malhas low-poly normais (são centenas, não milhares).
9. Efeitos: muzzle flash, traçantes, sangue e explosões com partículas em blocos de cor chapada; manchas de sangue como decalques no chão com limite de 2.000.
10. Streaming: só setores dentro do frustum mais uma margem de 1 setor ficam com malhas na GPU; o resto descarrega após 10 s fora.

**Metas de desempenho \[EST\]**

| Plataforma de referência | Meta |
| --- | --- |
| Notebook com GPU integrada recente, Chrome | 60 fps com 5.000 zumbis em L2 e 270 px internos |
| Desktop com GPU dedicada, Electron | 60 fps com 10.000 zumbis em L2 |
| Worker, 4x, cidade inteira | tick médio abaixo de 12 ms com 8.000 agentes em L1 ou L2 |

**Áudio**

- Web Audio pelo grafo do `chrome` (adaptado do Urbe Oasis). Sons posicionais só na batalha; no mapa, só alertas.
- Gemidos da horda como uma camada contínua cujo volume segue o número de zumbis visíveis (3 níveis), em vez de um som por zumbi.
- Limite de 24 vozes simultâneas com prioridade (explosão, tiro do jogador, alerta, ambiente).

**Lista de assets do MVP**

| Asset | Quantidade | Origem sugerida |
| --- | --- | --- |
| Malha de zumbi com VAT (3 tipos por escala e cor) | 1 malha, 4 clipes | low-poly feito em Blender, VAT exportada por script |
| Soldado (3 uniformes por cor) | 1 malha, 4 clipes | low-poly |
| Veículos: utilitário, blindado de rodas, caminhão, helicóptero de transporte | 4 | low-poly |
| Estruturas da seção 6 | 10 | procedurais (caixas e cilindros) |
| Prédios | procedurais | `citygen` |
| Props de rua: carro abandonado, poste, árvore, barreira | 6 | low-poly |
| Ícones de UI e do mapa | cerca de 40 | SVG |
| Paleta do tema | 1 | 32 cores |
| Sons: 3 armas, explosão pequena e grande, motor, rotor, gemido em 3 níveis, alerta, UI | cerca de 20 | bibliotecas CC0 ou geração própria, sempre com licença registrada |
| Música | 2 faixas (menu e tensão) | original |

O agente não deve baixar assets de terceiros sem licença compatível registrada em `docs/assets.md`. Enquanto o asset final não existir, usar formas primitivas coloridas pelo tema.

## 10. Backlog

O backlog tem 9 marcos em ordem estrita; o agente só começa um marco quando todos os critérios do anterior passam no CI. O marco M2 é o portão do projeto: se a horda não bater a meta de desempenho, parar e reavaliar a arquitetura com o Marcel antes de seguir.

### M0. Fundação do repositório

| ID | Tarefa | Critério de aceite |
| --- | --- | --- |
| M0.1 | Criar o monorepo pnpm com a estrutura da seção 2, TypeScript, ESLint, Prettier, Vitest e Playwright, copiando a configuração do Urbe Oasis | `pnpm check` passa num repositório vazio de regras |
| M0.2 | Copiar `kernel` e `bridge` do Urbe Oasis com os testes deles | testes do RNG, hash e fila de comandos passam |
| M0.3 | Regras de lint do pacote `simulation`: proibir `Math.random`, `Date`, `performance` e funções transcendentais; `lib: ["ES2023"]` sem tipos de DOM | um arquivo de teste com `Math.sin` falha o lint |
| M0.4 | CI no GitHub Actions igual ao do Urbe Oasis, e deploy no GitHub Pages | push na `main` publica uma página com o canvas vazio |
| M0.5 | `AGENTS.md` com as regras da seção 11 e `docs/` com esta especificação dividida em arquivos | arquivos existem e estão linkados no README |

### M1. Cidade e câmera contínua

| ID | Tarefa | Critério de aceite |
| --- | --- | --- |
| M1.1 | `citygen`: grid de ruas com variação, quarteirões, prédios com altura, 4 a 6 distritos, porto na borda com água | mesma semente gera o mesmo hash; 5 sementes geram cidades conectadas (BFS de rua alcança 100% das ruas) |
| M1.2 | `view3d`: cena, render low-res com upscale nearest, toon shading e outline | captura de tela via Playwright mostra pixels nítidos em 270 px internos |
| M1.3 | Câmera contínua de 40 a 2.000 m com as faixas da seção 7 e snap de texel | zoom do máximo ao mínimo sem queda abaixo de 50 fps e sem tela de carregamento |
| M1.4 | Streaming de setores e LOD de prédios | memória de GPU estável após 5 minutos de navegação automática (teste de render-benchmark) |
| M1.5 | Vista de mapa com distritos coloridos e nomes | na faixa acima de 1.200 m só aparece o mapa; abaixo de 300 m só a cena 3D |

### M2. Horda (portão de desempenho)

| ID | Tarefa | Critério de aceite |
| --- | --- | --- |
| M2.1 | Pool de zumbis em arrays tipados e sistema `hordeAgents` com estados vagando e perseguindo | teste unitário: zumbi a 20 m de um alvo visível chega ao contato em até 20 s |
| M2.2 | Flow field por setor com orçamento por tick | 10.000 agentes contornam prédios até um alvo; nenhum agente atravessa célula `blocked` |
| M2.3 | Hash espacial e separação | densidade máxima por célula de 4 x 4 m não passa de 12 agentes |
| M2.4 | Buffer da horda (SAB com fallback para transferência) e render por `InstancedMesh` com VAT placeholder | Electron e Chrome com COOP/COEP usam SAB; Pages sem cabeçalho usa fallback e funciona |
| M2.5 | Horda agregada L0, promoção e rebaixamento com histerese | teste de conservação: soma de zumbis constante após 10.000 ticks de câmera andando, sem combate |
| M2.6 | Benchmark `pnpm bench:horde` | **Portão:** 8.000 agentes a 4x com tick médio abaixo de 12 ms no runner do CI, e 60 fps com 5.000 visíveis na máquina de referência |

### M3. Unidades e combate

| ID | Tarefa | Critério de aceite |
| --- | --- | --- |
| M3.1 | Esquadrões com soldados, seleção, ordem de mover com A\* e formações | e2e: selecionar por caixa e mover; esquadrão chega em formação |
| M3.2 | Sistema `combat` com as fórmulas 5.2 e as tabelas de armas | teste de cenário: esquadrão da Guarda parado contra 300 comuns em fila vence em 10 de 10 sementes |
| M3.3 | Posturas e ordens hold, delay, withdraw | `delay` recua para a linha seguinte quando a pressão passa de 70% |
| M3.4 | Infecção (5.4) | soldado mordido vira zumbi entre 60 e 180 s; morto por explosão não volta |
| M3.5 | Utilitário e blindado: dirigir só por rua, atropelar, metralhadora | atropelamento acima de 5 m/s mata comum |
| M3.6 | Visibilidade e fog of war (5.7) | zumbis fora da visão não são desenhados nem aparecem no mapa de calor |
| M3.7 | Combate L0 e calibração contra L2 | mesmo cenário em L0 e L2 com 10 sementes: baixas dentro de ±25% |

### M4. Base, construção e empilhamento

| ID | Tarefa | Critério de aceite |
| --- | --- | --- |
| M4.1 | Criar base, estoque e menu de construção com prévia fantasma | prévia vermelha fora da base ou sem materiais; comando rejeitado na engine pelo mesmo motivo |
| M4.2 | Estruturas da tabela 6 (pelo menos HESCO, muro, portão, ninho, depósito de munição, ponto de combustível) | cada uma tem teste de construção, dano e destruição |
| M4.3 | Empilhamento em paredes (5.3) | 200 zumbis contra um muro de 3,5 m sem defensores transpõem em até 60 s; com ninho ativo, não transpõem em 120 s |
| M4.4 | Reabastecimento só na base | esquadrão sem munição longe da base continua sem munição; perto do depósito recarrega na taxa da 5.9 |

### M5. Logística e distritos

| ID | Tarefa | Critério de aceite |
| --- | --- | --- |
| M5.1 | Comboios de caminhão com planejador e rota | comboio leva 8 t de uma base a outra e o estoque muda na chegada |
| M5.2 | Helicóptero de transporte: carga suspensa, pouso, fast-rope, zumbis agarrando | helicóptero abaixo de 6 m sobre 10 zumbis cai em até 10 s se não subir |
| M5.3 | Distritos: pressão e estados (5.10), conversão de civis | distrito sem defesa com 3.000 zumbis vai de Hold a Lost em 3 a 8 minutos de jogo |
| M5.4 | Evacuação e triagem de quarentena com opção de desligar a execução | opção desligada remove o botão e a regra; teste de cenário de surto ao liberar infectado |

### M6. O Coro e o fogo de apoio

| ID | Tarefa | Critério de aceite |
| --- | --- | --- |
| M6.1 | Diretivas do Coro com aviso (5.11) | todo ataque tem aviso entre 20 e 40 s antes; nunca mais de 3 diretivas ativas |
| M6.2 | Fogo de apoio: obuseiro, canhão naval, míssil, ataque aéreo, drone | paiol cai a cada uso; pedido fora de alcance é rejeitado com motivo na UI |
| M6.3 | Dano a prédios e escombros | prédio com vida 0 vira escombro, bloqueia células e o flow field se atualiza |

### M7. Controle direto, UI completa e partida

| ID | Tarefa | Critério de aceite |
| --- | --- | --- |
| M7.1 | Controle direto com TAB para soldado, veículo e helicóptero | entrar e sair não muda o hash da simulação além dos comandos dados |
| M7.2 | Todas as telas da seção 8 em en e pt-BR | e2e percorre menu, briefing, partida, pausa, configurações e resumo |
| M7.3 | Vitória, derrota e resumo com o gancho de campanha gravado no save | cenário automatizado chega à vitória e à derrota |
| M7.4 | Save e load no IndexedDB e por arquivo, no worker | salvar, carregar e rodar 1.000 ticks dá o mesmo hash que rodar direto |
| M7.5 | Áudio da seção 9 | limite de 24 vozes respeitado em batalha com 5.000 zumbis |

### M8. Desktop e distribuição

| ID | Tarefa | Critério de aceite |
| --- | --- | --- |
| M8.1 | `apps/desktop` com Electron, protocolo `app://`, COOP e COEP, preload mínimo | o jogo abre offline e `crossOriginIsolated` é `true` |
| M8.2 | electron-builder: AppImage, Snap, Flatpak, Windows e macOS | CI gera os artefatos Linux; Snap e Flatpak instalam e abrem numa VM Ubuntu |
| M8.3 | Integração Steam opcional com steamworks.js (conquistas básicas) | sem o cliente Steam o jogo abre normalmente; com ele, uma conquista de teste desbloqueia |
| M8.4 | Script de upload para SteamPipe documentado | `docs/release.md` descreve o passo a passo; upload é manual |

## 11. Regras para o agente de IA

Estas regras vão para o `AGENTS.md` do repositório novo, em inglês, e seguem as do Urbe Oasis.

1. Trabalhar um marco por vez, na ordem da seção 10, e uma tarefa por pull request. Uma tarefa só está pronta quando o critério de aceite tem um teste automatizado que passa no CI. Compilar não é estar pronto.
2. A simulação é TypeScript puro e determinístico: sem DOM, sem APIs de Node, sem relógio real, sem `Math.random`, sem funções transcendentais. Todo sorteio usa o RNG da engine em ordem fixa.
3. React não contém regra de jogo; só envia comandos e lê estado. O renderer nunca altera a simulação.
4. Todo número de jogo fica em `packages/shared/src/balance/`. Quando mudar um valor desta especificação, registrar o novo valor e o motivo em `docs/balancing.md`.
5. Para cada sistema novo: teste unitário, um cenário em `tests/scenarios` e uma entrada no benchmark se ele rodar por tick.
6. Rodar `pnpm check` antes de cada commit; para mudanças de UI, também `pnpm test:e2e`. Para mudanças na simulação, comparar `pnpm bench` com a execução anterior e não aceitar piora acima de 10% sem justificar no PR.
7. Nomes, textos, assets e mapas são próprios. Assets só com licença registrada em `docs/assets.md`.
8. Código, comentários, documentação técnica, commits e PRs em inglês (conventional commits). Texto do jogador em `i18n` com `en` e `pt-BR`.
9. Quando uma regra desta especificação se mostrar impossível ou ruim na prática, implementar a alternativa mais simples que preserve os pilares da seção 1, documentar a mudança no PR e seguir. Só parar para perguntar no portão de desempenho do M2 ou se um pilar estiver em risco.

## Fontes

- [Urbe Oasis](https://github.com/gamestudio42/urbe-oasis): `AGENTS.md`, `docs/architecture.md` e `package.json` como base da stack.

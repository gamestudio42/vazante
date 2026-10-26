const en = {
  'app.title': 'Vazante',
  'boot.loading': 'Generating the city…',
  'top.time': 'Time',
  'top.paused': 'Paused',
  'top.soldiers': 'Soldiers',
  'top.zombies': 'Infected',
  'top.killed': 'Killed',
  'top.ammo': 'Ammo',
  'top.limited': 'simulation limited',
  'band.tactical': 'Tactical',
  'band.transition': 'Transition',
  'band.strategic': 'Operations map',
  'band.direct': 'Direct control',
  'squads.title': 'Squads',
  'squad.alive': 'alive',
  'order.idle': 'Idle',
  'order.move': 'Moving',
  'order.hold': 'Holding',
  'stance.hold': 'Hold',
  'stance.aggressive': 'Aggressive',
  'stance.defensive': 'Defensive',
  'stance.withdraw': 'Withdraw',
  'formation.line': 'Line',
  'formation.column': 'Column',
  'formation.wedge': 'Wedge',
  'formation.circle': 'Circle',
  'sel.none': 'Select a squad (click or drag). Right click to move.',
  'sel.direct': 'Take control (TAB)',
  'alerts.title': 'Alerts',
  'alert.soldier_bitten': 'Soldier bitten',
  'alert.soldier_died': 'Soldier killed',
  'alert.soldier_turned': 'Soldier turned',
  'alert.zombie_risen': 'A fallen soldier rose',
  'alert.out_of_ammo': 'Out of ammo',
  'alert.squad_arrived': 'Squad in position',
  'alert.command_rejected': 'Order refused',
  'reason.no_path': 'no path',
  'reason.direct_control_active': 'not during direct control',
  'reason.soldier_unavailable': 'soldier unavailable',
  'reason.not_direct_controlled': 'not under direct control',
  'reason.no_space': 'no space',
  'direct.exit': 'TAB to exit · R reload · click to fire',
  'direct.lock': 'Click to aim with the mouse',
  'help.title': 'Controls',
  'help.toggle': 'H: help',
  'help.body':
    'Pan: WASD / arrows / middle drag · Zoom: wheel · M: operations map · Q/E rotate\nSelect: click or drag · Move: right click · Stance: Z X C V · Formation: F\nSpace pause · F1 F2 F3 speed · TAB direct control · K spawn a test horde at the cursor',
} as const;

type Key = keyof typeof en;

const ptBR: Record<Key, string> = {
  'app.title': 'Vazante',
  'boot.loading': 'Gerando a cidade…',
  'top.time': 'Tempo',
  'top.paused': 'Pausado',
  'top.soldiers': 'Soldados',
  'top.zombies': 'Infectados',
  'top.killed': 'Abatidos',
  'top.ammo': 'Munição',
  'top.limited': 'simulação limitada',
  'band.tactical': 'Tático',
  'band.transition': 'Transição',
  'band.strategic': 'Mapa de operações',
  'band.direct': 'Controle direto',
  'squads.title': 'Esquadrões',
  'squad.alive': 'vivos',
  'order.idle': 'Parado',
  'order.move': 'Deslocando',
  'order.hold': 'Em posição',
  'stance.hold': 'Segurar',
  'stance.aggressive': 'Agressiva',
  'stance.defensive': 'Defensiva',
  'stance.withdraw': 'Recuar',
  'formation.line': 'Linha',
  'formation.column': 'Coluna',
  'formation.wedge': 'Cunha',
  'formation.circle': 'Círculo',
  'sel.none': 'Selecione um esquadrão (clique ou arraste). Clique direito para mover.',
  'sel.direct': 'Assumir controle (TAB)',
  'alerts.title': 'Alertas',
  'alert.soldier_bitten': 'Soldado mordido',
  'alert.soldier_died': 'Soldado morto',
  'alert.soldier_turned': 'Soldado se transformou',
  'alert.zombie_risen': 'Um soldado caído se levantou',
  'alert.out_of_ammo': 'Sem munição',
  'alert.squad_arrived': 'Esquadrão em posição',
  'alert.command_rejected': 'Ordem recusada',
  'reason.no_path': 'sem caminho',
  'reason.direct_control_active': 'não durante o controle direto',
  'reason.soldier_unavailable': 'soldado indisponível',
  'reason.not_direct_controlled': 'fora do controle direto',
  'reason.no_space': 'sem espaço',
  'direct.exit': 'TAB para sair · R recarregar · clique para atirar',
  'direct.lock': 'Clique para mirar com o mouse',
  'help.title': 'Controles',
  'help.toggle': 'H: ajuda',
  'help.body':
    'Mover câmera: WASD / setas / botão do meio · Zoom: roda · M: mapa de operações · Q/E girar\nSelecionar: clique ou arraste · Mover: clique direito · Postura: Z X C V · Formação: F\nEspaço pausa · F1 F2 F3 velocidade · TAB controle direto · K cria uma horda de teste no cursor',
};

const dictionaries = { en, 'pt-BR': ptBR } as const;
export type Locale = keyof typeof dictionaries;

let locale: Locale = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'pt-BR';

export function setLocale(l: Locale): void {
  locale = l;
}

export function getLocale(): Locale {
  return locale;
}

export function t(key: Key | string): string {
  const d = dictionaries[locale] as Record<string, string>;
  return d[key] ?? (en as Record<string, string>)[key] ?? key;
}

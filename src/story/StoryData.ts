import { StoryChapter } from '../types';

export const STORY_CHAPTERS: StoryChapter[] = [
  {
    id: 1,
    title: 'Capítulo 1: O Caso da Coxinha e os Títulos de Bilhões',
    subtitle: 'Assalto ao Banco Central & Fuga Desesperada na Metrópole',
    briefing:
      'Luca e Miguel planejaram o assalto perfeito ao cofre de títulos do Banco Central disfarçados de motoboys de entrega. O plano era infalível, até o Miguel derrubar molho de pimenta no leitor biométrico e disparar o alarme geral da cidade! Agora, viaturas de patrulha fecham o cerco e o Capitão Ramos promete acabar com a festa.',
    trackId: 'track_city',
    initialHeat: 2,
    objectiveText: 'Despiste o cerco da polícia na metrópole com velocidade e drifts precisos!',
    timeLimitSec: 120,
    rewardCash: 20000,
    rewardRep: 300,
    dialogueIntro: [
      {
        speaker: 'Miguel',
        portrait: 'miguel',
        text: 'LUCA! PISA FUNDO NESSA LATA VELHA! O alarme biométrico disparou e tem três viaturas cantando pneu na nossa esquina!',
      },
      {
        speaker: 'Luca',
        portrait: 'luca',
        text: 'Lata velha?! Respeita o V8 aspirado! E a culpa foi sua, quem manda tentar comer pastel com molho em cima do teclado do cofre?!',
      },
      {
        speaker: 'Miguel',
        portrait: 'miguel',
        text: 'O pastel de carne tava esfriando, tá legal?! Eram 4 horas da manhã! Mas relaxa, os títulos de 10 milhões tão todos no porta-luvas... junto com a coxinha!',
      },
      {
        speaker: 'Capitão Ramos',
        portrait: 'cop',
        radioEffect: true,
        text: 'Atenção todas as unidades do Setor 4! Os fugitivos do Banco Central estão num esportivo com neon ridículo! Interceptem com força total, não deixem esse lunático cruzar a ponte!',
      },
      {
        speaker: 'Luca',
        portrait: 'luca',
        text: 'Neon ridículo?! Ah, agora o Ramos me ofendeu no pessoal! Miguel, segura a marmita que eu vou puxar o freio de mão na rotatória!',
      },
    ],
    dialogueMidList: [
      {
        triggerSec: 18,
        lines: [
          {
            speaker: 'Miguel',
            portrait: 'miguel',
            text: 'AI MEU DEUS! A coxinha voou no para-brisa! Luca, tem uma viatura tentando emparelhar pela esquerda!',
          },
          {
            speaker: 'Luca',
            portrait: 'luca',
            text: 'Deixa ele vir! Quando ele encostar, vou dar um toque no freio e deixar o poste fazer o trabalho dele!',
          },
        ],
      },
      {
        triggerSec: 42,
        lines: [
          {
            speaker: 'Central Policial',
            portrait: 'dispatch',
            radioEffect: true,
            text: 'Central informa: o alvo acabou de fazer um drift de ré a 140 km/h no cruzamento da Sé! Viatura 12 rodou e acertou um carrinho de pipoca!',
          },
          {
            speaker: 'Capitão Ramos',
            portrait: 'cop',
            radioEffect: true,
            text: 'Eu não quero saber do carrinho de pipoca, prendam esse delinquente ou vocês vão patrulhar a pé no cemitério!',
          },
        ],
      },
    ],
    dialogueOutro: [
      {
        speaker: 'Miguel',
        portrait: 'miguel',
        text: 'Conseguimos! Perdemos as viaturas de vista nos becos do centro! E o melhor de tudo: a coxinha sobreviveu!',
      },
      {
        speaker: 'Luca',
        portrait: 'luca',
        text: 'Você é inacreditável, Miguel. Vamos pro galpão secreto das docas descarregar a grana antes que o Ramos rastreie a placa.',
      },
    ],
  },
  {
    id: 2,
    title: 'Capítulo 2: Cheiro de Sardinha & Emboscada nas Docas',
    subtitle: 'Cercados por contêineres gigantes e viaturas pesadas',
    briefing:
      'Um informante fofoqueiro entregou a localização do esconderijo portuário para o Capitão Ramos. O porto foi completamente bloqueado com fita de pregos e viaturas de choque. Luca e Miguel precisam navegar pelo labirinto de contêineres e usar o peso das viaturas contra elas mesmas!',
    trackId: 'track_docks',
    initialHeat: 3,
    objectiveText: 'Sobreviva ao cerco nas docas, destrua viaturas agressivas e fuja pelo portão norte.',
    timeLimitSec: 140,
    rewardCash: 35000,
    rewardRep: 500,
    dialogueIntro: [
      {
        speaker: 'Miguel',
        portrait: 'miguel',
        text: 'Luca, nós fomos traídos! A saída das docas tá cheia de viaturas pesadas e o ar tá com um cheiro insuportável de sardinha estragada!',
      },
      {
        speaker: 'Luca',
        portrait: 'luca',
        text: 'Foi o Dente de Ouro, aquele traíra! Eu disse que não devíamos ter aceitado o galpão dele. Mas relaxa, as docas são nosso parque de diversões!',
      },
      {
        speaker: 'Capitão Ramos',
        portrait: 'cop',
        radioEffect: true,
        text: 'Aqui é o Capitão Ramos no megafone! Luca e Miguel, vocês estão cercados por água e ferro! Desliguem o motor e saiam devagar, ou eu mesmo passo por cima do carro de vocês com a viatura tática!',
      },
      {
        speaker: 'Luca',
        portrait: 'luca',
        text: 'Passar por cima de quem, Ramos?! Essa barca blindada sua não faz uma curva nem com reza brava! Miguel, me indica o corredor dos contêineres azuis!',
      },
      {
        speaker: 'Miguel',
        portrait: 'miguel',
        text: 'Corredor azul à esquerda! Mas cuidado com as empilhadeiras, eu não sei nadar!',
      },
    ],
    dialogueMidList: [
      {
        triggerSec: 20,
        lines: [
          {
            speaker: 'Miguel',
            portrait: 'miguel',
            text: 'Eles tão jogando as viaturas de lado pra prensar a gente nos contêineres! Puxa o nitro, Luca!',
          },
          {
            speaker: 'Luca',
            portrait: 'luca',
            text: 'Nitro engatado! Segura a bronca, vamos passar tirando tinta da caçamba de peixe!',
          },
        ],
      },
      {
        triggerSec: 50,
        lines: [
          {
            speaker: 'Capitão Ramos',
            portrait: 'cop',
            radioEffect: true,
            text: 'Viatura 04, por que diabos vocês pararam?! Respondam!',
          },
          {
            speaker: 'Central Policial',
            portrait: 'dispatch',
            radioEffect: true,
            text: 'Capitão... a viatura 04 bateu num carregamento de anchovas e os policiais tão soterrados de frutos do mar.',
          },
          {
            speaker: 'Miguel',
            portrait: 'miguel',
            text: 'HAHAHAHAHA! Ramos, pede um limãozinho que o almoço tá servido!',
          },
        ],
      },
    ],
    dialogueOutro: [
      {
        speaker: 'Luca',
        portrait: 'luca',
        text: 'Arrombamos o portão de ferro das docas! Tamo na pista livre rumo à rodovia litorânea!',
      },
      {
        speaker: 'Miguel',
        portrait: 'miguel',
        text: 'Minha camisa tá cheirando a peixe frito, mas a nossa reputação nas ruas acabou de explodir! O Ramos nunca vai esquecer essa humilhação!',
      },
    ],
  },
  {
    id: 3,
    title: 'Capítulo 3: Duelo em Alta Voltagem na Rodovia Neon',
    subtitle: 'Os Interceptores V8 da Tropa de Choque e o Penhasco sem Volta',
    briefing:
      'Furioso com o fiasco das docas, o Capitão Ramos liberou a tropa de elite da Polícia Rodoviária: os lendários Interceptores V8 Biturbo com pushbar reforçado para a manobra P.I.T. A perseguição atinge mais de 230 km/h à beira de penhascos e curvas cegas.',
    trackId: 'track_coast',
    initialHeat: 4,
    objectiveText: 'Mantenha velocidade acima de 190 km/h e despiste os interceptores policiais.',
    timeLimitSec: 150,
    rewardCash: 55000,
    rewardRep: 750,
    dialogueIntro: [
      {
        speaker: 'Miguel',
        portrait: 'miguel',
        text: 'Luca... olha no retrovisor. Não são viaturas comuns. São os Interceptores V8 da Tropa de Choque! Aqueles caras não dão ordem de prisão, eles jogam o carro no mar!',
      },
      {
        speaker: 'Luca',
        portrait: 'luca',
        text: 'Finalmente adversários à altura! Miguel, por que você acha que eu instalei suspensão esportiva e freios de carbono? Pra passear no shopping?!',
      },
      {
        speaker: 'Miguel',
        portrait: 'miguel',
        text: 'Luca, nós somos criminosos procurados, não dublês de cinema! A gente podia ter feito faculdade de contabilidade, trabalhando num escritório quentinho com ar-condicionado...',
      },
      {
        speaker: 'Luca',
        portrait: 'luca',
        text: 'Contabilidade?! Você ia morrer de tédio na primeira planilha! Agora ajusta o GPS que a curva do penhasco tá chegando a 240 por hora!',
      },
      {
        speaker: 'Capitão Ramos',
        portrait: 'cop',
        radioEffect: true,
        text: 'Atenção esquadrão Interceptor! Manobra P.I.T. autorizada com máxima agressividade. O Viper preto não pode chegar ao túnel da serra!',
      },
    ],
    dialogueMidList: [
      {
        triggerSec: 22,
        lines: [
          {
            speaker: 'Miguel',
            portrait: 'miguel',
            text: 'TEM UM INTERCEPTOR NA NOSSA TRASEIRA DANDO GOLPE DE PUSHBAR! O carro tá chicoteando!',
          },
          {
            speaker: 'Luca',
            portrait: 'luca',
            text: 'Contra-esterça na direção da pancada... agora contra-esterço pro outro lado... TOMA ESSE DRIFT NA CARA!',
          },
        ],
      },
      {
        triggerSec: 55,
        lines: [
          {
            speaker: 'Central Policial',
            portrait: 'dispatch',
            radioEffect: true,
            text: 'Interceptor 02 perdeu o controle na curva do farol e despencou na praia! Pilotos ejetaram em segurança na areia!',
          },
          {
            speaker: 'Capitão Ramos',
            portrait: 'cop',
            radioEffect: true,
            text: 'LUCA! QUANDO EU BOTAR AS MÃOS EM VOCÊ, VOCÊ VAI PASSAR 30 ANOS CARPIDO O PÁTIO DO DETRAN!',
          },
          {
            speaker: 'Luca',
            portrait: 'luca',
            text: 'Aproveita e traz um cafezinho pro intervalo, Ramos!',
          },
        ],
      },
    ],
    dialogueOutro: [
      {
        speaker: 'Miguel',
        portrait: 'miguel',
        text: 'Eles ficaram pra trás no túnel! Meu coração tá batendo a 300 BPM, mas que pilotagem absurda foi essa, Luca!',
      },
      {
        speaker: 'Luca',
        portrait: 'luca',
        text: 'Isso é arte sobre rodas, meu parceiro. Agora respira fundo... porque o Ramos não vai aceitar isso. Ele vai pro deserto com tudo que tem.',
      },
    ],
  },
  {
    id: 4,
    title: 'Capítulo 4: O Salto do Milhão no Cânion do Deserto',
    subtitle: 'Helicóptero Militar de Busca, Blindados SWAT e a Ponte Quebrada',
    briefing:
      'O cerco final se fecha no Cânion do Deserto. O próprio Capitão Ramos embarcou no helicóptero de perseguição aérea com holofote de busca de alta potência. Bloqueios de concreto e blindados SWAT fecham a fronteira estadual. A única saída é um salto suicida!',
    trackId: 'track_desert',
    initialHeat: 5,
    objectiveText: 'Fuja do holofote do helicóptero militar e cruze a fronteira pelo salto do cânion!',
    timeLimitSec: 180,
    rewardCash: 90000,
    rewardRep: 1200,
    dialogueIntro: [
      {
        speaker: 'Capitão Ramos',
        portrait: 'cop',
        radioEffect: true,
        text: 'LUCA E MIGUEL! Aqui é o Capitão Ramos falando diretamente do helicóptero de ataque sobre vocês! O espaço aéreo é meu, a rodovia é minha e a carreira de vocês acaba HOJE!',
      },
      {
        speaker: 'Miguel',
        portrait: 'miguel',
        text: 'O HOLOFOTE TÁ CEGANDO O VIDRO TODO! O vento das hélices tá fazendo o carro flutuar na pista de terra! Luca, a gente tá frito!',
      },
      {
        speaker: 'Luca',
        portrait: 'luca',
        text: 'Abaixa o quebra-sol e foca no traçado, Miguel! O helicóptero é rápido, mas ele não consegue fazer curvas fechadas entre os paredões de pedra!',
      },
      {
        speaker: 'Miguel',
        portrait: 'miguel',
        text: 'A ponte da fronteira tá dinamitada em obras, Luca! Tem um vão de 40 metros de abismo! Se a gente for reto, a gente vai conhecer São Pedro!',
      },
      {
        speaker: 'Luca',
        portrait: 'luca',
        text: '40 metros?! Se eu atingir 260 km/h com nitro duplo na ponta da rampa, o carro plana que nem um jato! Você confia em mim ou não?!',
      },
      {
        speaker: 'Miguel',
        portrait: 'miguel',
        text: 'EU ODEIO QUANDO VOCÊ ME FAZ ESSA PERGUNTA! Mas sim, seu maluco... EU CONFIO! PISA FUNDO!',
      },
    ],
    dialogueMidList: [
      {
        triggerSec: 25,
        lines: [
          {
            speaker: 'Capitão Ramos',
            portrait: 'cop',
            radioEffect: true,
            text: 'Blindados SWAT, fechem a barreira de concreto antes da ponte! Eles estão encurralados!',
          },
          {
            speaker: 'Luca',
            portrait: 'luca',
            text: 'Miguel, segura no teto! Vou usar a lateral do blindado como rampa de lançamento!',
          },
        ],
      },
      {
        triggerSec: 65,
        lines: [
          {
            speaker: 'Miguel',
            portrait: 'miguel',
            text: 'A RAMPA TÁ NA NOSSA FRENTE! NITRO EM 3... 2... 1... VAAAAAAAI!',
          },
          {
            speaker: 'Capitão Ramos',
            portrait: 'cop',
            radioEffect: true,
            text: 'NÃO, NÃO, NÃO! ELES NÃO SÃO LOUCOS DE SALTAR ESSE ABISMO! PILOTO, PUXA O HELICÓPTERO PRA CIMA!',
          },
          {
            speaker: 'Central Policial',
            portrait: 'dispatch',
            radioEffect: true,
            text: 'Meu Deus... o Viper preto acabou de saltar sobre o cânion e aterrissou do outro lado da serra cantando pneu!',
          },
        ],
      },
    ],
    dialogueOutro: [
      {
        speaker: 'Miguel',
        portrait: 'miguel',
        text: 'NÓS ESTAMOS VIVOS! NÓS ESTAMOS VIVOS, LUCA! A GENTE VOOU POR CIMA DO ABISMO E DA POLÍCIA TODA!',
      },
      {
        speaker: 'Luca',
        portrait: 'luca',
        text: 'Eu te disse, parceiro! A lei tem viaturas e helicópteros... mas a gente tem química e um motor com alma!',
      },
      {
        speaker: 'Capitão Ramos',
        portrait: 'cop',
        radioEffect: true,
        text: '...Todas as unidades, abortar perseguição. Cruzaram a fronteira do estado... Droga de pilotos geniais.',
      },
    ],
  },
  {
    id: 5,
    title: 'Capítulo 5: O Grande Golpe Final: O Carro de Ouro do Cartel',
    subtitle: 'Tempestade Noturna na Metrópole & Aposentadoria Milionária',
    briefing:
      'O corrupto Don Salieri tentou entregar a cabeça de Luca e Miguel para a polícia em troca de clemência, mas a dupla descobriu que ele está transportando um Hypercarro carregado de diamantes brutos pelo centro da metrópole sob chuva torrencial. É a missão final: roubar o cartel, vencer a polícia e garantir a lenda definitiva do submundo!',
    trackId: 'track_city',
    initialHeat: 5,
    objectiveText: 'Interceptar o comboio do cartel, derrotar os blindados e conquistar a liberdade eterna!',
    timeLimitSec: 200,
    rewardCash: 150000,
    rewardRep: 2500,
    dialogueIntro: [
      {
        speaker: 'Don Salieri',
        portrait: 'rival',
        radioEffect: true,
        text: 'Luca... você achou mesmo que dois garotos com um esportivo de segunda mão iam escapar de mim e da polícia ao mesmo tempo?',
      },
      {
        speaker: 'Luca',
        portrait: 'luca',
        text: 'Salieri! Você tentou vender a gente pro Ramos, mas esqueceu que nas ruas dessa cidade quem manda somos nós!',
      },
      {
        speaker: 'Miguel',
        portrait: 'miguel',
        text: 'Salieri, eu hackeei o sistema de rastreamento do seu Hypercarro de ouro! Seu comboio tá desprotegido na tempestade!',
      },
      {
        speaker: 'Capitão Ramos',
        portrait: 'cop',
        radioEffect: true,
        text: 'Na escuta! Ramos aqui! Eu descobri o esquema sujo do Salieri e sei que vocês dois estão na mesma pista. Hoje ninguém escapa impune!',
      },
      {
        speaker: 'Luca',
        portrait: 'luca',
        text: 'Hoje é o confronto final, Ramos! O crime organizado contra a polícia e os maiores pilotos da história no meio do tiroteio! PISA FUNDO, MIGUEL!',
      },
    ],
    dialogueMidList: [
      {
        triggerSec: 30,
        lines: [
          {
            speaker: 'Miguel',
            portrait: 'miguel',
            text: 'A pista tá encharcada de chuva! O asfalto tá parecendo sabão, qualquer vacilo a gente capota!',
          },
          {
            speaker: 'Luca',
            portrait: 'luca',
            text: 'É assim que eu gosto! No seco qualquer um corre, na tempestade só quem tem sangue frio vence!',
          },
        ],
      },
      {
        triggerSec: 70,
        lines: [
          {
            speaker: 'Don Salieri',
            portrait: 'rival',
            radioEffect: true,
            text: 'Meus seguranças foram destruídos! Como vocês conseguem fazer essas curvas sem frear?!',
          },
          {
            speaker: 'Luca',
            portrait: 'luca',
            text: 'Chama-se paixão pelo asfalto, Salieri! Passa a chave do Hypercarro que sua aposentadoria começou mais cedo!',
          },
        ],
      },
    ],
    dialogueOutro: [
      {
        speaker: 'Miguel',
        portrait: 'miguel',
        text: 'SALIERI PRESO E OS DIAMANTES ESTÃO NO NOSSO PORTA-MALAS! A GENTE É OFICIALMENTE RICO PRA SEMPRE!',
      },
      {
        speaker: 'Luca',
        portrait: 'luca',
        text: 'Adeus, Capitão Ramos. Deixamos um pastel e uma coxinha quentinha na recepção da sua delegacia de presente!',
      },
      {
        speaker: 'Capitão Ramos',
        portrait: 'cop',
        radioEffect: true,
        text: '...Confesso que o pastel tava gostoso. Boa sorte no Caribe, seus patifes. Vocês mereceram a lenda.',
      },
      {
        speaker: 'Miguel',
        portrait: 'miguel',
        text: 'CARIBE, AÍ VAMOS NÓS! E DESSA VEZ EU VOU DE PRIMEIRA CLASSE COMENDO COXINHA GOURMET!',
      },
    ],
  },
];

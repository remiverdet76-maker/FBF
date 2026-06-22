var ARCHETYPES=[
  {id:1,name:'Mobilité',color:'#e84a6f',tone:'Mouvement, communication, adaptation rapide',tension:'Dispersion mentale, agitation',action:'Marche, échauffement, prise de notes ciblée'},
  {id:2,name:'Relation',color:'#f07b38',tone:'Échange affectif, valeur, harmonie sociale',tension:'Dépendance affective, sensibilité accrue',action:'Écoute active, clarifier limites relationnelles'},
  {id:3,name:'Matière',color:'#f5c842',tone:'Incarnation, sécurité, besoins concrets',tension:'Résistance au changement, sur-ancrage',action:'Routines corporelles, alimentation consciente'},
  {id:4,name:'Action',color:'#6ab84e',tone:'Impulsion, courage, mise en mouvement',tension:'Impulsivité, épuisement possible',action:'Pause avant décision, activité physique structurée'},
  {id:5,name:'Expansion',color:'#3ab8a0',tone:'Vision, croissance, confiance',tension:'Surestimation, engagements trop larges',action:'Tester à petite échelle, limiter les promesses'},
  {id:6,name:'Structure',color:'#4a8fe8',tone:'Limites, discipline, responsabilité',tension:'Rigidité, poids des obligations',action:'Déléguer, réévaluer obligations, poser limites'},
  {id:7,name:'Innovation',color:'#7b58d4',tone:'Rupture, liberté, originalité',tension:'Instabilité, ruptures brusques',action:'Prototyper avant rupture, sécuriser les bases'},
  {id:8,name:'Sensibilité',color:'#c45bbf',tone:'Rêve, intuition, dissolution des frontières',tension:'Flou, confusion, idéalisation',action:'Journaling, pratiques de discernement'},
  {id:9,name:'Transformation',color:'#d44a4a',tone:'Profondeur, régénération, intensité',tension:'Crises profondes, remises en question',action:'Rituels d\'intégration, accompagnement progressif'},
  {id:10,name:'Synthèse',color:'#8b6e3c',tone:'Intégration des cycles, mémoire longue',tension:'Rumination, difficulté à clore',action:'Bilan de cycle, archivage, tri symbolique',spiral:true},
  {id:11,name:'Incubation',color:'#9b59b6',tone:'Densification, retour au centre, préparation',tension:'Isolement, fermeture excessive',action:'Repos profond, intention pour le cycle suivant',spiral:true},
  {id:12,name:'Germination',color:'#e8a0d0',tone:'Potentiel silencieux, naissance imminente',tension:'Impatience, surcharge avant départ',action:'Silence actif, rituel de clôture de cycle',spiral:true}
];
var STATES=[
  {key:'11/10',name:'Expansion douce',color:'#f5c842',desc:'Ouverture progressive, activation contrôlée'},
  {key:'12/10',name:'Expansion maximale',color:'#e84a6f',desc:'Pic d\'extériorisation, intensité élevée'},
  {key:'10/11',name:'Contraction douce',color:'#3ab8a0',desc:'Retour intérieur, consolidation'},
  {key:'10/12',name:'Contraction maximale',color:'#7b58d4',desc:'Incubation, profondeur, densité'}
];
function parseDate(v){if(!v)return null;var d=new Date(v+'T00:00:00');return isNaN(d)?null:d}
function fmtDate(d){if(!d)return '—';return d.toISOString().slice(0,10)}
function addDays(d,n){var x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));x.setUTCDate(x.getUTCDate()+n);return x}
function daysBetween(a,b){return Math.floor((Date.UTC(b.getUTCFullYear(),b.getUTCMonth(),b.getUTCDate())-Date.UTC(a.getUTCFullYear(),a.getUTCMonth(),a.getUTCDate()))/86400000)}
function computeFromJ0(j0,ref){
  ref=ref||new Date();
  var daysSince=daysBetween(j0,ref);
  var cycleIndex=Math.floor(daysSince/432)+1;
  var dayInCycle=(daysSince%432)+1;
  var cycle108=((cycleIndex-1)%108)+1;
  var phaseIndex=Math.floor((dayInCycle-1)/36)+1;
  var archId=((dayInCycle-1)%9)+1;
  var stateIdx=(dayInCycle-1)%4;
  var state=STATES[stateIdx];
  var axisIndex=((cycle108-1)%36)+1;
  var axisCyclePos=Math.floor((cycle108-1)/36)+1;
  var isSpiral=dayInCycle>=361;
  var prevCycle=cycle108===1?108:cycle108-1;
  var nextCycle=cycle108===108?1:cycle108+1;
  var displayArch=archId;
  if(phaseIndex===11)displayArch=10;
  else if(phaseIndex===12)displayArch=11;
  return{daysSince:daysSince,cycleIndex:cycleIndex,dayInCycle:dayInCycle,phaseIndex:phaseIndex,cycle108:cycle108,archId:archId,displayArch:displayArch,stateIdx:stateIdx,state:state,axisIndex:axisIndex,axisCyclePos:axisCyclePos,isSpiral:isSpiral,prevCycle:prevCycle,nextCycle:nextCycle};
}
/* ═══════════════════════════════════════════════
   MATRICE 36 MICRO-CYCLES — VERS Re#Mi♭
   2 vers par micro-cycle de 12 jours
   index = (dayInCycle-1) / 12 | 0   → 0..35
   ═══════════════════════════════════════════════ */
var VERS_MATRIX=[
  // AXE ÉMERGENCE — MC 1-12
  {arch:'Mobilité',axe:'Émergence',v1:'Chat farceur fait le pitre, quand il fait froid est à l\'heure.',v2:'Rien ne lui échappe chez l\'homme, il s\'adapte aussitôt.'},
  {arch:'Relation',axe:'Émergence',v1:'Mon amour rayonne quand tu t\'élèves,',v2:'Annonce un réveil splendide de beauté.'},
  {arch:'Matière',axe:'Émergence',v1:'Je suis ancré au sol comme l\'arbre de vie à ses racines.',v2:'Je suis là où je dois être et je fais ce qui est juste.'},
  {arch:'Action',axe:'Émergence',v1:'Dans un doute secret se cultive le soleil.',v2:'Quand le jour se lève, nos âmes brillent de merveil.'},
  {arch:'Expansion',axe:'Émergence',v1:'Nous sommes la génération qui vibre libre, pour vivre.',v2:'Rien n\'arrête un peuple qui danse.'},
  {arch:'Structure',axe:'Émergence',v1:'Le vent emporte tout et le calme peut renaître.',v2:'Je suis maître de mes choix, de ma pensée.'},
  {arch:'Innovation',axe:'Émergence',v1:'Par nature féline, ce chasseur cherche l\'âme sœur,',v2:'Souverain d\'un royaume, châtelain sans fortune.'},
  {arch:'Sensibilité',axe:'Émergence',v1:'Ami d\'un soir, que ressens-tu dans le son qui parle ?',v2:'Une plainte ou un cri de révolte, nous dansons l\'espoir.'},
  {arch:'Transformation',axe:'Émergence',v1:'Prisonnier de ses chaînes invisibles,',v2:'Sapiens survit face au terrible charme.'},
  {arch:'Mobilité',axe:'Émergence',v1:'Le rythme oblique la pensée dans une spirale de songe',v2:'Pendant que le cœur tribal plonge dans mille fréquences.'},
  {arch:'Relation',axe:'Émergence',v1:'Nos noces de miel sur tes lèvres laissent un goût de thé parfumé.',v2:'Les corps s\'animent quand l\'heure sonne, écoutez ce bonheur animal qui grogne.'},
  {arch:'Matière',axe:'Émergence',v1:'Dans l\'écorce de l\'arbre se cachent des cercles, de vicieux trésors entre terre et ciel.',v2:'Nature bestiale des sens interdits se transcende aux rayons de lumière.'},
  // AXE CONSOLIDATION — MC 13-24
  {arch:'Action',axe:'Consolidation',v1:'Douze signes m\'apportent leur présage.',v2:'La peur s\'adoucit quand le mal dominant, assagi par l\'effet domino des anges.'},
  {arch:'Expansion',axe:'Consolidation',v1:'Perdus de vue par le temps du passé,',v2:'Reviennent sans un bruit, ignorant l\'âge.'},
  {arch:'Structure',axe:'Consolidation',v1:'Miroir au reflet tranquille,',v2:'De quel côté vient la nuit ? Ton rôle est fragile.'},
  {arch:'Innovation',axe:'Consolidation',v1:'Les sourds dansent la binaire au labyrinthe des pensées.',v2:'L\'illusion d\'une arnaque — et le jour se lève, personne ne remarque.'},
  {arch:'Sensibilité',axe:'Consolidation',v1:'Malade, vous avez dit malade, vraiment ?',v2:'Mais de ta pensée naissent les étoiles.'},
  {arch:'Transformation',axe:'Consolidation',v1:'Que se torde le temps, que plie l\'espace,',v2:'Que danse l\'univers où chacun a une place.'},
  {arch:'Mobilité',axe:'Consolidation',v1:'Assis en tailleur. Le dos droit. Le regard digne.',v2:'Une posture sans tension, détendu mais alerte.'},
  {arch:'Relation',axe:'Consolidation',v1:'La respiration lente comme une vague',v2:'Pousse ces pensées comme de l\'écume légère.'},
  {arch:'Matière',axe:'Consolidation',v1:'La graine devient arbre.',v2:'La sève se déplace depuis les racines vers les feuilles.'},
  {arch:'Action',axe:'Consolidation',v1:'À chaque inspiration, l\'ego s\'évapore un peu plus.',v2:'À chaque expiration, il condense un peu plus.'},
  {arch:'Expansion',axe:'Consolidation',v1:'Il contemple sans jugement le monde vaste.',v2:'Il observe celui qui observe, en paix.'},
  {arch:'Structure',axe:'Consolidation',v1:'L\'homme au cœur fané souffre de solitude,',v2:'La bourrasque de poil lui apprit l\'éphémère.'},
  // AXE INTÉGRATION — MC 25-36
  {arch:'Innovation',axe:'Intégration',v1:'Dans l\'ombre paisible où les pensées résonnent,',v2:'Que l\'univers n\'est qu\'un cœur de fréquences.'},
  {arch:'Sensibilité',axe:'Intégration',v1:'Chaque pierre murmure une note ancienne,',v2:'Celui qui apprend à voir autrement entend battre l\'infini dans chaque instant.'},
  {arch:'Transformation',axe:'Intégration',v1:'Souriante au soleil, elle fait vibrer l\'action,',v2:'Laissant guider le vide par l\'intuition.'},
  {arch:'Mobilité',axe:'Intégration',v1:'Pardon à l\'amour, qui vibre au grand jour.',v2:'Pardon à l\'illusion, voici ma décision.'},
  {arch:'Relation',axe:'Intégration',v1:'S\'il y a des obstacles, ce n\'est pas l\'infini.',v2:'Si cela se capture, ce n\'est pas un arc-en-ciel.'},
  {arch:'Matière',axe:'Intégration',v1:'La conscience s\'élève sans un bruit.',v2:'Des fils de vie se tissent, géométriques, sur la sphère sacrée.'},
  // SPIRALE — MC 31-36
  {arch:'Action Spirale',axe:'Spirale',v1:'Do au soleil il cherche ses racines en silence,',v2:'Léger comme un son, fort par le cœur.'},
  {arch:'Expansion Spirale',axe:'Spirale',v1:'Solitaire rêveur, Ré mineur en trous de ver,',v2:'La beauté infinie qui transcende l\'univers.'},
  {arch:'Structure Spirale',axe:'Spirale',v1:'Aux douze coups de minuit elles se dessinent,',v2:'Tissant les rêves d\'étranges révélations.'},
  {arch:'Innovation Spirale',axe:'Spirale',v1:'Dans le feu et la glace, dans la terre et l\'espace,',v2:'L\'intuition prend les rênes pour que les masques comprennent.'},
  {arch:'Incubation',axe:'Spirale',v1:'Le poète jugé rêveur sourit enfin aux étoiles.',v2:'Qui vibrent de bonheur dans l\'alignement astral.'},
  {arch:'Germination',axe:'Spirale',v1:'En son centre naissant, un cercle de vie,',v2:'Le Rêveur étoilé d\'un mystère infini.'}
];

/* ═══════════════════════════════════════════════
   BANQUES DE PHRASES PAR ARCHÉTYPE
   Chaque entrée : [expansion, contraction]
   ═══════════════════════════════════════════════ */
var ARCH_PHRASES={
  1:{
    corps:['Le corps s\'éveille dans un flux léger, rapide, prêt à saisir chaque signal du milieu.','Le corps cherche à se poser, à ralentir la cadence pour laisser les informations se décanter.'],
    psyche:['Le mental s\'active et multiplie les connexions — chaque idée en appelle une autre.','Le mental observe ses propres mouvements, trie ce qui mérite d\'être retenu.'],
    lien:['La communication est fluide, les échanges s\'enchaînent naturellement.','Les échanges gagnent en profondeur ce qu\'ils perdent en volume.'],
    ombre:['Le risque est de courir d\'un sujet à l\'autre sans jamais achever ce qui a été commencé.','La tendance est de s\'isoler dans ses pensées et de perdre le fil des engagements extérieurs.'],
    invitation:['Choisir une direction et la tenir jusqu\'au bout, même si d\'autres horizons appellent.','Revenir à l\'essentiel : qu\'est-ce qui mérite vraiment d\'être poursuivi ?']
  },
  2:{
    corps:['Le corps est finement calibré sur les présences autour de lui — les tensions relationnelles se logent dans la gorge et les épaules.','Le corps se referme doucement, comme pour protéger ce qui est précieux à l\'intérieur.'],
    psyche:['Le registre affectif est ouvert : on donne facilement, on reçoit avec intensité.','On évalue, on pèse, on cherche à comprendre ce qui a de la valeur et ce qui en a perdu.'],
    lien:['Les rencontres portent une charge émotionnelle forte — chaque échange laisse une trace.','Les liens existants sont passés au tamis : lesquels nourrissent vraiment ?'],
    ombre:['La sensibilité peut se muer en dépendance si l\'on confond l\'approbation de l\'autre avec sa propre valeur.','Le retrait relationnel peut masquer une blessure non digérée plutôt qu\'un choix conscient.'],
    invitation:['Cultiver une relation équilibrée entre donner et recevoir, sans perdre son axe.','Nommer ce qui fait mal, sans l\'enfouir sous une apparente indifférence.']
  },
  3:{
    corps:['Le corps revendique son espace concret : l\'ancrage, la nourriture, le rythme physique comptent plus que jamais.','Le corps ralentit et demande à être servi en priorité — sommeil, digestion, récupération.'],
    psyche:['L\'esprit cherche la tangible : plans, listes, résultats mesurables.','L\'esprit fait le point sur ce qui est réellement solide dans la vie matérielle.'],
    lien:['On exprime son affection par des actes concrets plutôt que par des mots.','On ressent le besoin d\'être entouré de stabilité plutôt que de sollicitations nouvelles.'],
    ombre:['L\'attachement aux acquis peut freiner le mouvement naturel du cycle.','La prudence peut se refermer sur elle-même et devenir une résistance au changement nécessaire.'],
    invitation:['Investir le corps consciemment : marche, alimentation, gestes lents.','Distinguer la sécurité réelle de la sécurité illusoire bâtie sur l\'accumulation.']
  },
  4:{
    corps:['Le corps est sous tension préparatoire : une énergie musculaire cherche à se décharger.','Le corps enregistre la fatigue des efforts passés et réclame du repos actif.'],
    psyche:['La volonté est tranchante, l\'intention claire — on sait ce que l\'on veut faire.','On réévalue les actions entreprises : lesquelles méritent d\'être poursuivies ?'],
    lien:['L\'entourage perçoit une présence affirmée, directe, parfois tranchante.','On a besoin d\'espace pour traiter en solo avant de remettre de l\'énergie dans les liens.'],
    ombre:['L\'impulsivité peut court-circuiter la réflexion et générer des conflits évitables.','La lassitude peut se transformer en découragement si on ne ménage pas les ressources.'],
    invitation:['Canaliser l\'impulsion par une pratique physique ou une tâche à fort retour visible.','Faire une pause avant toute décision engageante — la précipitation coûte ici très cher.']
  },
  5:{
    corps:['La cage thoracique s\'ouvre, la respiration s\'élargit — le corps veut prendre de l\'espace.','Le corps cherche à digérer une expansion récente, à retrouver ses limites naturelles.'],
    psyche:['La vision porte loin : on projette, on imagine, on construit mentalement des possibles.','On reconsidère les ambitions passées avec un regard plus lucide sur ce qui est réellement faisable.'],
    lien:['On inspire les autres par son enthousiasme et sa capacité à ouvrir des horizons.','On a besoin de calme et de recul pour ne pas se laisser emporter par les attentes des autres.'],
    ombre:['L\'excès de confiance peut conduire à des engagements trop larges, impossibles à honorer.','La désillusion guette si l\'on compare trop vite ce qui est accompli à ce qui avait été rêvé.'],
    invitation:['Tester à petite échelle avant d\'étendre : un prototype vaut mieux qu\'un plan parfait.','Revenir à l\'essentiel de la vision, élaguer ce qui s\'y est accroché de superflu.']
  },
  6:{
    corps:['Le corps tient droit, la posture se structure — quelque chose en soi cherche à s\'organiser.','Le corps ressent le poids des structures portées et invite à alléger.'],
    psyche:['L\'esprit classe, hiérarchise, établit des priorités avec une rigueur inhabituelle.','L\'esprit examine les règles qu\'il s\'est données : lesquelles servent encore vraiment ?'],
    lien:['On occupe naturellement une position de référence pour l\'entourage.','On perçoit la lourdeur des rôles tenus et le besoin de poser certaines responsabilités.'],
    ombre:['La rigidité peut s\'installer si l\'on confond discipline et fermeture au vivant.','La tendance au retrait peut masquer un épuisement des structures portées depuis trop longtemps.'],
    invitation:['Introduire de la souplesse dans au moins une routine tenue fermement.','Déléguer une responsabilité et observer ce que cela libère en soi.']
  },
  7:{
    corps:['Le corps est électrique, traversé par des impulsions qui cherchent une forme nouvelle.','Le corps a besoin de silence et de sol ferme après une période d\'agitation.'],
    psyche:['L\'esprit remet en question les cadres établis — une idée neuve peut surgir à tout moment.','L\'esprit trie les ruptures passées : lesquelles ont ouvert quelque chose, lesquelles ont coûté sans retour ?'],
    lien:['On apporte une vibration originale qui déplace les habitudes autour de soi.','On ressent le besoin de souffler loin des attentes habituelles pour redevenir soi-même.'],
    ombre:['Le besoin de liberté peut provoquer des ruptures brusques regrettées a posteriori.','L\'instabilité peut désorienter ceux qui comptent sur notre présence régulière.'],
    invitation:['Canaliser la rupture créatrice dans un domaine précis, sans fragiliser toute la structure en même temps.','Ancrer les bases avant de remettre en jeu ce qui fonctionne encore.']
  },
  8:{
    corps:['Le corps est poreux, finement réceptif — les variations de l\'ambiance traversent directement.','Le corps cherche à se recentrer, à retrouver ses contours après une période de grande perméabilité.'],
    psyche:['L\'intuition est à son pic — les images, les rêves, les pressentiments ont une valeur réelle.','L\'esprit revient du flou et cherche à remettre du discernement là où tout s\'était brouillé.'],
    lien:['On perçoit l\'état intérieur des autres avec une acuité parfois surprenante.','On a besoin de frontières claires pour ne pas porter ce qui appartient à d\'autres.'],
    ombre:['La dissolution des frontières peut mener à une confusion entre ce qui est soi et ce qui est reçu de l\'extérieur.','L\'idéalisation peut s\'effondrer brutalement si la réalité ne correspond pas à l\'image projetée.'],
    invitation:['Nommer ce qui est ressenti sans le mélanger à ce qui est perçu chez les autres.','Clarifier un engagement ambigu : la vaguerie coûte plus ici que la clarté franche.']
  },
  9:{
    corps:['Le corps est habité d\'une intensité sourde — quelque chose se transforme à un niveau profond.','Le corps sort d\'une crise ou d\'une mue et cherche à récupérer ses forces lentement.'],
    psyche:['L\'esprit plonge dans les couches denses de l\'expérience : ce qui était enfoui remonte.','L\'esprit intègre une transformation récente et cherche à lui donner un sens stable.'],
    lien:['Les liens superficiels tombent d\'eux-mêmes — seuls les liens essentiels résistent.','On a besoin de relations capables de tenir sans jugement ce qui est en train de se recomposer.'],
    ombre:['La profondeur peut devenir pesanteur si l\'on ne trouve pas d\'exutoire à l\'intensité.','La tendance à tout remettre en question peut paralyser là où une simple action suffirait.'],
    invitation:['Trouver un rituel qui honore ce qui se transforme sans le forcer à aboutir trop vite.','Reconnaître le chemin parcouru avant de mesurer l\'écart qui reste.']
  },
  10:{
    corps:['Le corps enregistre silencieusement tout ce que le cycle a traversé — une forme de mémoire longue s\'active.','Le corps demande à être libéré des tensions accumulées : un travail somatique profond est bienvenu.'],
    psyche:['L\'esprit fait la synthèse : des fils disparates du cycle se raccordent et prennent sens.','L\'esprit revient sur les décisions prises et les intègre dans une compréhension plus large.'],
    lien:['Les relations portent l\'empreinte de tout ce qui a été vécu ensemble dans ce cycle.','On ressent le besoin de mettre des mots sur ce qui a changé dans les liens importants.'],
    ombre:['La rumination peut s\'installer si l\'on reste trop longtemps dans le bilan sans avancer vers la clôture.','La difficulté à lâcher ce qui est terminé peut retarder le mouvement naturel vers le prochain cycle.'],
    invitation:['Écrire ou exprimer un bilan de cycle, aussi court soit-il — mettre forme libère.','Identifier une chose à déposer consciemment avant que le cycle ne se referme.']
  },
  11:{
    corps:['Le corps entre en phase de densification — les processus internes travaillent en profondeur, loin du bruit.','Le corps a besoin d\'obscurité et de silence comme la graine a besoin de la terre.'],
    psyche:['L\'esprit se retire dans ses couches les plus denses — la pensée ralentit et s\'intériorise.','L\'esprit prépare silencieusement ce qui ne peut pas encore être dit.'],
    lien:['Les liens s\'apaisent d\'eux-mêmes — ce n\'est pas le moment de forcer le contact.','Seuls les liens qui n\'exigent rien trouvent naturellement leur place ici.'],
    ombre:['L\'isolement peut se confondre avec un repli défensif si l\'on n\'en perçoit pas l\'origine.','La fermeture peut devenir hermétique et couper des ressources qui seraient pourtant nourrissantes.'],
    invitation:['Honorer ce silence sans chercher à le remplir — il est porteur.','Formuler intérieurement l\'intention pour le prochain cycle, sans l\'annoncer encore.']
  },
  12:{
    corps:['Le corps est au seuil — une énergie nouvelle commence à poindre sous la surface encore calme.','Le corps tient encore dans le silence mais quelque chose frémit déjà sous la peau.'],
    psyche:['L\'esprit perçoit confusément ce qui cherche à naître — des images, des désirs, une direction.','L\'esprit finit de dégager le terrain pour que ce qui arrive trouve de l\'espace.'],
    lien:['Les liens anciens se redéfinissent naturellement selon ce que le prochain cycle apportera.','On commence à ressentir qui et quoi mérite d\'être emmené dans le prochain cycle.'],
    ombre:['L\'impatience peut faire sortir de la germination trop tôt — le germe brisé ne pousse pas.','La surcharge de dernière minute peut épuiser les ressources nécessaires à l\'ouverture.'],
    invitation:['Tenir encore dans le silence — le prochain J0 est proche.','Poser une intention simple, claire, sans liste de conditions.']
  }
};

var STATE_PHRASES={
  0:{ // 11/10 expansion douce
    polarite:'L\'énergie monte doucement, comme une marée qui s\'annonce — l\'ouverture est progressive et contrôlée.',
    corps_etat:'La respiration s\'élargit naturellement, le système nerveux s\'éveille sans se brusquer.',
    action:'C\'est le moment des premières actions, des explorations prudentes, des amorces intentionnelles.',
    saison:'Cette phase correspond à l\'équinoxe de printemps : le mouvement commence, la lumière revient sans encore tout envahir.'
  },
  1:{ // 12/10 expansion maximale
    polarite:'L\'énergie est à son pic d\'extériorisation — la puissance d\'expression est maximale.',
    corps_etat:'Le corps est actif, parfois agité, il cherche à se dépenser et à laisser une trace visible.',
    action:'C\'est le moment d\'agir fortement, de communiquer clairement, de faire face à ce qui se présente.',
    saison:'Cette phase correspond au solstice d\'été : tout est dehors, tout brille, mais l\'épuisement guette si l\'on ne gère pas l\'intensité.'
  },
  2:{ // 10/11 contraction douce
    polarite:'L\'énergie commence son retour vers l\'intérieur — un tri naturel s\'opère sans forcer.',
    corps_etat:'Le corps ralentit doucement, la digestion des expériences récentes commence.',
    action:'C\'est le moment de consolider, de réfléchir, d\'ajuster ce qui a été lancé.',
    saison:'Cette phase correspond à l\'équinoxe d\'automne : on récolte, on trie, on prépare la traversée intérieure.'
  },
  3:{ // 10/12 contraction maximale
    polarite:'L\'énergie est pleinement retournée vers le centre — la densité intérieure est à son maximum.',
    corps_etat:'Le corps réclame le repos profond, la chaleur, le silence — c\'est une nécessité biologique, pas une faiblesse.',
    action:'C\'est le moment de l\'intégration profonde, des rituels de clôture, de l\'incubation.',
    saison:'Cette phase correspond au solstice d\'hiver : tout se tient dans l\'obscurité, chargé de potentiel non encore manifesté.'
  }
};

var AXIS_PHRASES=[
  'L\'axe d\'émergence porte les premières découvertes — on apprend encore les règles de ce terrain.',
  'L\'axe de consolidation demande de structurer ce qui a été découvert — la forme est en train de se préciser.',
  'L\'axe d\'intégration est celui de la maturité — on transmet ce que l\'on a vraiment traversé.'
];

var PHASE_PHRASES={
  early:  'Les phases initiales du cycle sont celles de l\'impulsion — l\'énergie cherche sa direction.',
  middle: 'Les phases médianes sont celles de l\'expression pleine — le cycle est en pleine activité.',
  late:   'Les phases tardives préparent la transition — le cycle commence à regarder vers ce qui viendra.',
  spiral: 'La zone spirale est hors du temps ordinaire du cycle — elle appartient à un rythme différent, plus lent et plus dense.'
};

function generateAnalysis(j0,comp){
  var arch=ARCHETYPES[comp.displayArch-1];
  var state=comp.state;
  var ap=ARCH_PHRASES[comp.displayArch];
  var sp=STATE_PHRASES[comp.stateIdx];
  var isExp=comp.stateIdx<=1;
  var expIdx=isExp?0:1;

  /* ── PHASE LABEL ── */
  var phaseLabel=comp.isSpiral?PHASE_PHRASES.spiral:comp.phaseIndex<=4?PHASE_PHRASES.early:comp.phaseIndex<=8?PHASE_PHRASES.middle:PHASE_PHRASES.late;

  /* ── AXE LABEL ── */
  var axeLabel=AXIS_PHRASES[comp.axisCyclePos-1]||AXIS_PHRASES[0];

  /* ══════════════════════════════════════════
     ANALYSE RAPIDE — 9 PHRASES
     1 par dimension : archétype, état, corps,
     psyché, lien, tension, invitation, phase, axe
     ══════════════════════════════════════════ */
  var quick=[
    '① <strong>Archétype</strong> — '+arch.name+' ('+comp.displayArch+'/12) : '+arch.tone+'.',
    '② <strong>État respiratoire</strong> — '+state.key+' ('+state.name+') : '+sp.polarite,
    '③ <strong>Corps</strong> — '+ap.corps[expIdx],
    '④ <strong>Psyché</strong> — '+ap.psyche[expIdx],
    '⑤ <strong>Lien</strong> — '+ap.lien[expIdx],
    '⑥ <strong>Tension principale</strong> — '+ap.ombre[expIdx],
    '⑦ <strong>Invitation</strong> — '+ap.invitation[expIdx],
    '⑧ <strong>Phase '+comp.phaseIndex+'/12</strong> — '+phaseLabel,
    '⑨ <strong>Axe '+comp.axisIndex+' — position '+comp.axisCyclePos+'/3</strong> — '+axeLabel
  ];

  /* ══════════════════════════════════════════
     ANALYSE PROFONDE — 36 PHRASES
     4 phrases × 9 dimensions
     ══════════════════════════════════════════ */
  var deep=[
    /* DIMENSION 1 — ARCHÉTYPE (4) */
    {titre:'Archétype '+comp.displayArch+' — '+arch.name, phrases:[
      'L\'archétype actif dans ce moment du cycle est <strong>'+arch.name+'</strong> : '+arch.tone+'.',
      ap.corps[expIdx],
      ap.psyche[expIdx],
      'Ce que cet archétype demande concrètement : '+arch.action+'.'
    ]},
    /* DIMENSION 2 — ÉTAT RESPIRATOIRE (4) */
    {titre:'État — '+state.key+' ('+state.name+')', phrases:[
      sp.polarite,
      sp.corps_etat,
      sp.action,
      sp.saison
    ]},
    /* DIMENSION 3 — LIEN & RELATION (4) */
    {titre:'Registre relationnel', phrases:[
      ap.lien[expIdx],
      isExp?'L\'entourage perçoit une présence active, voire rayonnante — la qualité de présence est élevée.':'L\'entourage perçoit un retrait qui n\'est pas un rejet — communiquer sur ce besoin évite les malentendus.',
      isExp?'Les sollicitations extérieures sont nombreuses : choisir celles qui servent vraiment l\'élan du cycle.':'Le silence relationnel peut être fécond, à condition de ne pas le laisser s\'installer dans la durée.',
      'La tonalité relationnelle de cet archétype est ancrée dans : '+arch.tone+'.'
    ]},
    /* DIMENSION 4 — CORPS & VITALITÉ (4) */
    {titre:'Corps & vitalité', phrases:[
      ap.corps[expIdx],
      isExp?'L\'activation du système nerveux demande à être canalisée par le mouvement et l\'expression.':'Le système nerveux cherche le repos et la régulation — ne pas forcer contre ce signal.',
      isExp?'Pratiquer une activité physique d\'intensité modérée à élevée selon l\'état réel de réserve.':'Privilégier les pratiques douces : étirements, respiration lente, chaleur appliquée sur le corps.',
      'Le registre corporel de '+arch.name+' : '+arch.tone+'.'
    ]},
    /* DIMENSION 5 — PSYCHÉ & CLARTÉ (4) */
    {titre:'Psyché & clarté intérieure', phrases:[
      ap.psyche[expIdx],
      isExp?'Les pensées sont nombreuses et rapides — tenir un journal ou une liste permet de libérer l\'espace mental.':'Les pensées sont rares mais denses — chacune mérite d\'être accueillie lentement.',
      isExp?'Une décision prise dans cet élan est souvent juste si elle est ancrée dans le ressenti corporel.':'Une décision prise dans ce retrait gagne à être mûrie encore — la précipitation n\'est pas de saison.',
      'La qualité psychique de l\'archétype '+arch.name+' : '+arch.tone+'.'
    ]},
    /* DIMENSION 6 — TENSION & OMBRE (4) */
    {titre:'Tension & ombre du moment', phrases:[
      ap.ombre[expIdx],
      'La tension structurelle de cet état ('+state.key+') : '+(isExp?'trop projeter vers l\'extérieur sans revenir se recentrer.':'trop se retirer sans maintenir un fil de contact avec le monde.'),
      'La tension propre à '+arch.name+' : '+arch.tension+'.',
      comp.isSpiral?'La zone spirale amplifie toutes les tensions non digérées — ce qui n\'a pas été intégré remonte maintenant.':'Chaque tension non adressée dans cette phase se reportera sur la suivante avec plus de charge.'
    ]},
    /* DIMENSION 7 — INVITATION & ACTION (4) */
    {titre:'Invitation concrète', phrases:[
      ap.invitation[expIdx],
      'Action recommandée pour cet archétype dans ce cycle : '+arch.action+'.',
      isExp?'Planifier une pause de récupération dans les prochaines 48h — l\'élan est réel mais non infini.':'Planifier un moment d\'expression ou de contact dans les prochaines 48h — le retrait a aussi besoin d\'une issue.',
      'Se poser cette question d\'ici la fin de la journée : qu\'est-ce que cette énergie me demande de <em>commencer, poursuivre ou terminer</em> ?'
    ]},
    /* DIMENSION 8 — PHASE & CYCLE (4) */
    {titre:'Phase '+comp.phaseIndex+'/12 — Cycle '+comp.cycle108+'/108', phrases:[
      phaseLabel,
      'Jour '+comp.dayInCycle+' sur 432 : le cycle est actuellement à '+(Math.round(comp.dayInCycle/4.32))+'% de son déroulement.',
      comp.isSpiral?'La zone spirale a commencé au jour 361 — on se trouve à '+(comp.dayInCycle-360)+' jours dans cette densification.':'La zone spirale (jours 361–432) sera atteinte dans '+(361-comp.dayInCycle)+' jours.',
      (function(){var n=comp.axisIndex<=12?'naissance':comp.axisIndex<=24?'croissance':'maturité';var s=comp.axisIndex<=12?' — les fondations posées ici dureront.':comp.axisIndex<=24?' — ce qui est structuré maintenant devient durable.':' — ce qui est transmis ici porte au-delà du cycle.';return 'Le cycle canonique '+comp.cycle108+'/108 s\'inscrit dans un axe de '+n+s;})()
    ]},
    /* DIMENSION 9 — AXE & CHEMIN DE VIE (4) */
    {titre:'Axe '+comp.axisIndex+' — Position '+comp.axisCyclePos+'/3', phrases:[
      axeLabel,
      comp.axisCyclePos===1?'Position 1 de l\'axe : on est en phase d\'apprentissage — les erreurs sont des données, pas des échecs.':comp.axisCyclePos===2?'Position 2 de l\'axe : on est en phase de structuration — ce qui fonctionnait par intuition doit maintenant trouver une forme stable.':'Position 3 de l\'axe : on est en phase de transmission — on sait ce que l\'on a traversé, et cela vaut d\'être partagé.',
      'L\'axe '+comp.axisIndex+' porte les thèmes suivants : '+(comp.axisIndex<=12?'émergence, exploration, apprentissage fondamental':comp.axisIndex<=24?'consolidation, responsabilité, mise en forme':comp.axisIndex<=30?'intégration, synthèse, maturité':'service, transmission, rayonnement')+'.',
      'Ce que cet axe demande dans ce cycle : rester fidèle à la trajectoire profonde, même si la surface semble chaotique.'
    ]}
  ];

  return{
    header:'J0 = '+fmtDate(j0)+' · Jour '+comp.daysSince+' · Cycle '+comp.cycle108+' · Jour '+comp.dayInCycle+'/432',
    summary:'Archétype '+comp.displayArch+' ('+arch.name+') — État '+state.key+' ('+state.name+'). Phase '+comp.phaseIndex+'/12. Axe '+comp.axisIndex+' — position '+comp.axisCyclePos+'.',
    tonality:arch.tone,
    quick:quick, deep:deep,
    isSpiral:comp.isSpiral, arch:arch, state:state,
    tensions:[arch.tension], work:[arch.action], qualities:[], axisNote:axeLabel
  };
}
(function(){
  var g=document.getElementById('archetypes-grid');
  ARCHETYPES.forEach(function(a){
    var el=document.createElement('div');el.className='archetype-card';
    el.style.borderTopColor=a.color;
    el.innerHTML='<div class="archetype-num" style="color:'+a.color+'">'+a.id+'</div>'+'<div class="archetype-name">'+a.name+(a.spiral?' <span style="font-size:0.70rem;color:#9b59b6">spirale</span>':'')+'</div>'+'<div class="archetype-desc">'+a.tone+'</div>';
    g.appendChild(el);
  });
})();
function buildTable36(activeRow){
  activeRow=activeRow||0;
  var tbody=document.getElementById('table36-body');tbody.innerHTML='';
  var idx=1;
  for(var si=0;si<4;si++){
    for(var ai=0;ai<9;ai++){
      var arch=ARCHETYPES[ai];var state=STATES[si];
      var tr=document.createElement('tr');
      if(idx===activeRow)tr.classList.add('active-row');
      else if(idx%2===0)tr.style.background='linear-gradient(110deg,rgba(240,236,255,0.38),rgba(237,253,245,0.28))';
      tr.innerHTML='<td><strong>'+idx+'</strong></td>'+'<td><span class="energy-dot" style="background:'+arch.color+'"></span>'+arch.id+' — '+arch.name+'</td>'+'<td><span class="phase-badge" style="background:'+state.color+'22;color:'+state.color+'">'+state.key+'</span></td>'+'<td>P'+(si*9+ai+1)+'</td>'+'<td class="small">'+arch.tone+'</td>'+'<td class="small">'+arch.tension+'</td>'+'<td class="small">'+arch.action+'</td>';
      tbody.appendChild(tr);idx++;
    }
  }
}
buildTable36();
var currentJ0=null,lastComp=null;
function applyJ0(j0){
  currentJ0=j0;var comp=computeFromJ0(j0,new Date());lastComp=comp;
  var arch=ARCHETYPES[comp.displayArch-1];
  document.getElementById('r-j0').textContent=fmtDate(j0);
  document.getElementById('r-days').textContent=comp.daysSince;
  document.getElementById('r-cycle').textContent=comp.cycle108;
  document.getElementById('r-day').textContent=comp.dayInCycle+' / 432';
  document.getElementById('r-arch').textContent=comp.displayArch;
  document.getElementById('r-arch-name').textContent=arch.name;
  document.getElementById('r-state').textContent=comp.state.key;
  document.getElementById('r-state-name').textContent=comp.state.name;
  document.getElementById('r-axis').textContent=comp.axisIndex;
  document.getElementById('r-axis-pos').textContent='position '+comp.axisCyclePos+'/3';
  document.getElementById('r-prev-next').textContent=comp.prevCycle+' / '+comp.nextCycle;
  document.getElementById('ri-arch').style.borderLeftColor=arch.color;
  document.getElementById('spiral-badge-wrap').style.display=comp.isSpiral?'block':'none';
  var analysis=generateAnalysis(j0,comp);
  /* ── VERS du micro-cycle ── */
  var mcIdx=Math.min(35, Math.floor((comp.dayInCycle-1)/12));
  var mc=VERS_MATRIX[mcIdx];
  var versHTML='<div style="margin-bottom:12px;padding:12px 14px;border-radius:12px;'
    +'background:linear-gradient(135deg,rgba(245,200,66,0.10),rgba(123,88,212,0.08));'
    +'border-left:3px solid var(--gold);border-top:1px solid rgba(212,168,67,0.22);'
    +'border-right:1px solid rgba(212,168,67,0.10);border-bottom:1px solid rgba(212,168,67,0.10)">'
    +'<div style="font-family:\'Cinzel\',serif;font-size:0.68rem;text-transform:uppercase;letter-spacing:0.09em;font-weight:700;color:var(--gold);margin-bottom:8px">'
    +'Re#Mi♭ — Micro-cycle '+(mcIdx+1)+'/36 · Jours '+(mcIdx*12+1)+'–'+((mcIdx+1)*12)+' · '+mc.axe+'</div>'
    +'<p style="font-size:0.90rem;font-family:\'Playfair Display\',\'Cinzel\',serif;font-style:italic;color:var(--text);line-height:1.7;margin:0">'
    +mc.v1+'<br>'+mc.v2+'</p>'
    +'</div>';
  /* ── RAPIDE ── */
  document.getElementById('analysis-quick').innerHTML=
    '<p style="font-weight:700;margin-bottom:8px;color:var(--text)">'+analysis.header+'</p>'
    +versHTML
    +'<ol style="list-style:none;padding:0;margin:0">'+analysis.quick.map(function(s){
      return'<li style="padding:6px 10px 6px 4px;border-bottom:1px solid rgba(212,168,67,0.09);font-size:0.83rem;color:var(--muted);line-height:1.6">'+s+'</li>';
    }).join('')+'</ol>';
  /* ── PROFONDE ── */
  document.getElementById('analysis-deep').innerHTML=
    '<p style="font-weight:700;margin-bottom:10px;color:var(--text)">'+analysis.header+'</p>'
    +versHTML
    +analysis.deep.map(function(dim,di){
      var colors=['var(--e1)','var(--e2)','var(--e3)','var(--e4)','var(--e5)','var(--e6)','var(--e7)','var(--e8)','var(--e9)'];
      return'<div style="margin-bottom:12px;padding:10px 12px;border-radius:10px;background:linear-gradient(135deg,rgba(253,246,238,0.72),rgba(240,236,255,0.55));border-left:3px solid '+colors[di]+';border-top:1px solid rgba(212,168,67,0.12);border-right:1px solid rgba(212,168,67,0.08);border-bottom:1px solid rgba(212,168,67,0.08)">'
        +'<div style="font-family:\'Cinzel\',serif;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.07em;font-weight:700;color:'+colors[di]+';margin-bottom:6px">'+dim.titre+'</div>'
        +'<ol style="list-style:none;padding:0;margin:0">'+dim.phrases.map(function(p){
          return'<li style="padding:5px 4px 5px 18px;position:relative;font-size:0.81rem;color:var(--muted);line-height:1.55;border-bottom:1px solid rgba(212,168,67,0.06)">'
            +'<span style="position:absolute;left:4px;top:6px;font-size:0.50rem;color:'+colors[di]+'">◆</span>'+p+'</li>';
        }).join('')+'</ol>'
        +'</div>';
    }).join('');
  /* ── TOGGLE BUTTONS ── */
  document.querySelectorAll('.anlz-tab-btn').forEach(function(b){
    b.onclick=function(){
      document.querySelectorAll('.anlz-tab-btn').forEach(function(x){x.style.opacity='0.6';x.style.fontWeight='500'});
      b.style.opacity='1';b.style.fontWeight='700';
      var target=b.getAttribute('data-anlz');
      document.getElementById('analysis-quick').style.display=target==='quick'?'block':'none';
      document.getElementById('analysis-deep').style.display=target==='deep'?'block':'none';
    };
  });
  buildTable36(comp.stateIdx*9+comp.archId);
  document.getElementById('spiral-legend').style.display=comp.isSpiral?'flex':'none';
  var ss=document.getElementById('spiral-status');
  if(comp.isSpiral){var dins=comp.dayInCycle-360;ss.innerHTML='<span class="badge-spiral">🌀 Zone Spirale active</span><br><br><strong>'+(comp.phaseIndex===11?'Phase 11 — Incubation':'Phase 12 — Germination')+'</strong> — Jour '+dins+'/72 dans la spirale.<br><br>Priorise clôture, repos et intention pour le cycle suivant.';}
  else{ss.innerHTML='Position : jour '+comp.dayInCycle+'/432 (phase '+comp.phaseIndex+'/12).<br><br>Zone spirale dans <strong>'+(361-comp.dayInCycle)+' jours</strong> (jours 361–432).';}
  syncClock(comp);
}
document.getElementById('btn-calc-j0').addEventListener('click',function(){
  var b=parseDate(document.getElementById('birthdate').value);
  if(!b){alert('Saisis une date de naissance valide.');return;}
  var j0=addDays(b,-288);document.getElementById('j0date').value=j0.toISOString().slice(0,10);applyJ0(j0);
});
document.getElementById('btn-apply-j0').addEventListener('click',function(){
  var j0=parseDate(document.getElementById('j0date').value);
  if(!j0){alert('Saisis un J0 valide.');return;}applyJ0(j0);
});
document.getElementById('btn-reset').addEventListener('click',function(){
  document.getElementById('birthdate').value='';document.getElementById('j0date').value='';
  currentJ0=null;lastComp=null;
  ['r-j0','r-days','r-cycle','r-day','r-arch','r-arch-name','r-state','r-state-name','r-axis','r-axis-pos','r-prev-next'].forEach(function(id){document.getElementById(id).textContent='—'});
  document.getElementById('analysis-quick').textContent='Saisir une date de naissance ou un J0.';
  document.getElementById('analysis-deep').innerHTML='';
  document.getElementById('spiral-badge-wrap').style.display='none';
  buildTable36();syncClock({archId:1,displayArch:1,dayInCycle:1,cycle108:1,isSpiral:false});
});
document.getElementById('btn-sample').addEventListener('click',function(){
  var s=new Date();s.setUTCFullYear(s.getUTCFullYear()-30);s.setUTCMonth(5);s.setUTCDate(8);
  document.getElementById('birthdate').value=s.toISOString().slice(0,10);
  document.getElementById('btn-calc-j0').click();
});
document.getElementById('gen-fiche').addEventListener('click',function(){
  if(!currentJ0||!lastComp){alert('Applique d\'abord un J0 (onglet Lecture).');return;}
  var comp=lastComp,arch=ARCHETYPES[comp.displayArch-1],analysis=generateAnalysis(currentJ0,comp);
  var spiralH=comp.isSpiral?'<div style="margin:8px 0;padding:8px 12px;border-radius:8px;background:linear-gradient(90deg,rgba(123,88,212,0.12),rgba(196,91,191,0.08));border-left:3px solid #7b58d4;font-size:0.85rem">🌀 <strong>Zone Spirale active</strong> — Phase '+comp.phaseIndex+'/12 · Jour '+comp.dayInCycle+'/432</div>':'';
  var w=window.open('','_blank');
  w.document.write('<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><title>Fiche Thème 432</title><style>body{font-family:Georgia,serif;color:#3a2010;padding:24px;max-width:680px;margin:auto;background:linear-gradient(160deg,#fdf6ee,#f0ecff,#edfdf5)}h1{background:linear-gradient(90deg,#d4a843,#f5d97a);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;font-size:1.4rem}h2{color:#7b58d4;font-size:1rem;margin:16px 0 6px}.sub{color:#7a5a3a;font-size:0.85rem}ul{margin:6px 0;padding-left:18px}li{margin:4px 0;font-size:0.88rem;color:#5a3a20}.footer{margin-top:20px;font-size:0.75rem;color:#9a7a5a;border-top:1px solid rgba(212,168,67,0.3);padding-top:10px}</style></head><body>'
    +'<h1>Fiche personnelle — Thème 432 · Sphère Omcha</h1><p class="sub">'+analysis.header+'</p>'+spiralH
    +'<p><strong>Archétype '+comp.displayArch+' — '+arch.name+'</strong> · État <strong>'+comp.state.key+'</strong> ('+comp.state.name+')</p>'
    +'<p class="sub">Tonalité : '+arch.tone+'</p>'
    +'<h2>Résumé</h2><p style="font-size:0.9rem">'+analysis.summary+'</p><p class="sub">'+analysis.axisNote+'</p>'
    +'<h2>Tensions</h2><ul>'+analysis.tensions.map(function(t){return'<li>'+t+'</li>'}).join('')+'</ul>'
    +'<h2>Invitation</h2><ul>'+analysis.work.map(function(t){return'<li>'+t+'</li>'}).join('')+'</ul>'
    +'<h2>Analyse rapide</h2><ol style="padding-left:18px">'+analysis.quick.map(function(s,i){return'<li style="margin:5px 0;font-size:0.85rem;color:#5a3a20">'+s+'</li>'}).join('')+'</ol>'
    +'<h2>Checklist quotidienne</h2><ol style="padding-left:18px"><li style="margin:4px 0;font-size:0.88rem">Matin : 10 min d\'échauffement ou marche consciente</li><li style="margin:4px 0;font-size:0.88rem">Midi : pause 10 min, respiration 6/6</li><li style="margin:4px 0;font-size:0.88rem">Soir : journal (3 apprentissages du jour), rituel de fermeture</li><li style="margin:4px 0;font-size:0.88rem">Hebdo : revoir objectifs, ajuster selon le cycle</li></ol>'
    +'<div class="footer">Axe '+comp.axisIndex+' · Position '+comp.axisCyclePos+'/3 · Cycle '+comp.cycle108+'/108 · Sphère Omcha · Cycle 432</div></body></html>');
  w.document.close();
});
/* TABS — display:block/none uniquement, sans hidden */
document.querySelectorAll('.tab-btn').forEach(function(btn){
  btn.addEventListener('click',function(){
    document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('active')});
    btn.classList.add('active');
    var target=btn.getAttribute('data-target');
    document.querySelectorAll('.tab-panel').forEach(function(p){
      if(p.id===target){p.classList.add('active')}else{p.classList.remove('active')}
    });
    window.scrollTo({top:0,behavior:'smooth'});
  });
});
window.addEventListener('keydown',function(e){
  if(e.key>='1'&&e.key<='5'){var btn=document.querySelectorAll('.tab-btn')[parseInt(e.key,10)-1];if(btn)btn.click();}
});
/* HORLOGE 432 */
var canvas=document.getElementById('clock');
var ctx2=canvas.getContext('2d');
var CW=canvas.width,CH=canvas.height,CX=CW/2,CY=CH/2;
var RA=CW/2-18,RB=CW/2-65,RC=CW/2-112;
var clkA={a:0,b:0,c:0,last:Date.now()};
var isSpiral=false;
function drawClock2(){
  ctx2.clearRect(0,0,CW,CH);
  var bg=ctx2.createRadialGradient(CX,CY,0,CX,CY,RA+14);
  bg.addColorStop(0,'rgba(253,246,238,0.95)');bg.addColorStop(0.28,'rgba(240,236,255,0.82)');
  bg.addColorStop(0.60,'rgba(237,253,245,0.72)');bg.addColorStop(1,'rgba(255,248,236,0.55)');
  ctx2.beginPath();ctx2.arc(CX,CY,RA+14,0,Math.PI*2);ctx2.fillStyle=bg;ctx2.fill();
  if(isSpiral){
    var sp=ctx2.createRadialGradient(CX,CY,RA-20,CX,CY,RA+18);
    sp.addColorStop(0,'rgba(123,88,212,0.12)');sp.addColorStop(1,'rgba(196,91,191,0.02)');
    ctx2.beginPath();ctx2.arc(CX,CY,RA+18,0,Math.PI*2);ctx2.fillStyle=sp;ctx2.fill();
    ctx2.beginPath();ctx2.arc(CX,CY,RA+3,0,Math.PI*2);
    ctx2.strokeStyle='rgba(123,88,212,0.38)';ctx2.lineWidth=2;ctx2.setLineDash([6,4]);ctx2.stroke();ctx2.setLineDash([]);
  }
  [[RA,'rgba(212,168,67,0.20)',1.5],[RB,'rgba(74,143,232,0.14)',1],[RC,'rgba(106,184,78,0.12)',1]].forEach(function(r){
    ctx2.beginPath();ctx2.arc(CX,CY,r[0],0,Math.PI*2);ctx2.strokeStyle=r[1];ctx2.lineWidth=r[2];ctx2.stroke();
  });
  for(var i=0;i<12;i++){var ang=(i/12)*Math.PI*2-Math.PI/2;ctx2.beginPath();ctx2.moveTo(CX+Math.cos(ang)*(RA-8),CY+Math.sin(ang)*(RA-8));ctx2.lineTo(CX+Math.cos(ang)*(RA+3),CY+Math.sin(ang)*(RA+3));ctx2.strokeStyle='rgba(212,168,67,0.32)';ctx2.lineWidth=1.5;ctx2.stroke();}
  for(var j=0;j<9;j++){var a2=(j/9)*Math.PI*2-Math.PI/2;ctx2.beginPath();ctx2.moveTo(CX+Math.cos(a2)*(RC-4),CY+Math.sin(a2)*(RC-4));ctx2.lineTo(CX+Math.cos(a2)*(RC+3),CY+Math.sin(a2)*(RC+3));ctx2.strokeStyle='rgba(74,143,232,0.28)';ctx2.lineWidth=1;ctx2.stroke();}
  drawPt(clkA.a,RA,'#3ab8a0',8,20);drawPt(clkA.b,RB,'#d4a843',10,24);drawPt(clkA.c,RC,'#7b58d4',12,28);
  var cg=ctx2.createRadialGradient(CX,CY,0,CX,CY,10);cg.addColorStop(0,'rgba(212,168,67,0.90)');cg.addColorStop(1,'rgba(212,168,67,0)');
  ctx2.beginPath();ctx2.arc(CX,CY,10,0,Math.PI*2);ctx2.fillStyle=cg;ctx2.fill();
  ctx2.beginPath();ctx2.arc(CX,CY,4,0,Math.PI*2);ctx2.fillStyle='rgba(212,168,67,0.95)';ctx2.fill();
}
function drawPt(angle,radius,color,size,blur){
  var x=CX+Math.cos(angle-Math.PI/2)*radius,y=CY+Math.sin(angle-Math.PI/2)*radius;
  ctx2.save();ctx2.globalAlpha=0.07;ctx2.beginPath();ctx2.arc(CX,CY,radius,angle-Math.PI/2-0.3,angle-Math.PI/2);ctx2.strokeStyle=color;ctx2.lineWidth=size*2.2;ctx2.stroke();ctx2.restore();
  ctx2.beginPath();ctx2.fillStyle=color;ctx2.shadowColor=color;ctx2.shadowBlur=blur;ctx2.arc(x,y,size,0,Math.PI*2);ctx2.fill();ctx2.shadowBlur=0;
  ctx2.beginPath();ctx2.arc(x,y,size*1.9,0,Math.PI*2);ctx2.strokeStyle=color;ctx2.globalAlpha=0.13;ctx2.lineWidth=2;ctx2.stroke();ctx2.globalAlpha=1;
}
function syncClock(comp){
  var a=comp.displayArch||comp.archId||1;
  clkA.a=((a-1)/9)*Math.PI*2;clkA.b=((comp.dayInCycle-1)/432)*Math.PI*2;clkA.c=((comp.cycle108-1)/108)*Math.PI*2;
  clkA.last=Date.now();isSpiral=comp.isSpiral||false;
}
(function animate(){
  var now=Date.now(),dt=(now-clkA.last)/1000;
  clkA.a+=dt*(Math.PI*2)/(9*86400);clkA.b+=dt*(Math.PI*2)/(432*86400);clkA.c+=dt*(Math.PI*2)/(108*432*86400);
  clkA.last=now;drawClock2();requestAnimationFrame(animate);
})();
syncClock({archId:1,displayArch:1,dayInCycle:1,cycle108:1,isSpiral:false});

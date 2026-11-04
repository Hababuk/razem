// Shopping categories, keyword guessing and default store layouts.
export const CATS = {
  veg: { pl: 'Warzywa i owoce', en: 'Fruit & veg', e: '🥕' },
  bread: { pl: 'Pieczywo', en: 'Bakery', e: '🥖' },
  dairy: { pl: 'Nabiał i jajka', en: 'Dairy & eggs', e: '🥛' },
  meat: { pl: 'Mięso i wędliny', en: 'Meat & deli', e: '🥩' },
  fish: { pl: 'Ryby', en: 'Fish', e: '🐟' },
  frozen: { pl: 'Mrożonki', en: 'Frozen', e: '🧊' },
  pantry: { pl: 'Spiżarnia', en: 'Pantry', e: '🥫' },
  sweets: { pl: 'Słodycze i przekąski', en: 'Sweets & snacks', e: '🍫' },
  drinks: { pl: 'Napoje', en: 'Drinks', e: '🧃' },
  household: { pl: 'Chemia i higiena', en: 'Household', e: '🧴' },
  pets: { pl: 'Dla zwierząt', en: 'Pets', e: '🐾' },
  other: { pl: 'Inne', en: 'Other', e: '🛒' },
};
export const CAT_IDS = Object.keys(CATS);

// Typical walking order; each household adjusts it to their own store in Settings.
export const DEFAULT_LAYOUTS = {
  biedronka: ['veg', 'bread', 'dairy', 'meat', 'fish', 'frozen', 'pantry', 'sweets', 'drinks', 'household', 'pets', 'other'],
  lidl: ['veg', 'bread', 'pantry', 'sweets', 'dairy', 'meat', 'fish', 'frozen', 'drinks', 'household', 'pets', 'other'],
};

// Word-start stems (no Polish diacritics). Checked in this order — first match wins.
const KW = [
  ['pets', 'karma dla,karma,zwirek,dla psa,dla kota,gryzak,pet food,dog food,cat food,cat litter'],
  ['household', 'papier toalet,recznik papier,plyn,proszek,kapsulk,mydl,szampon,pasta do zeb,szczoteczk,gabk,worki,folia,chusteczk,pieluch,dezodor,zel pod,odplamiacz,tabletki do zmyw,soap,shampoo,toilet,toothpaste,detergent,sponge,bin bags,tissues'],
  ['frozen', 'mrozon,lody,lodow,frozen,ice cream'],
  ['fish', 'ryb,losos,dorsz,sledz,makrel,krewet,paluszki ryb,fish,salmon,cod,shrimp,prawn'],
  ['meat', 'mies,mieso,kurcz,wieprz,wolow,indyk,szynk,kielbas,boczek,parow,filet,mielon,salami,schab,karkow,udko,skrzydel,poledwic,kabanos,pasztet,chicken,beef,pork,ham,sausage,bacon,turkey,mince'],
  ['sweets', 'czekolad,cukierk,ciastk,chips,chrup,baton,zelk,orzech,paluszk,wafel,herbatnik,krakers,popcorn,chocolate,cookie,biscuit,candy,snack,nuts,crisps'],
  ['drinks', 'woda,wody,sok,napoj,cola,pepsi,piwo,wino,lemoniad,izoton,energetyk,water,juice,beer,wine,soda'],
  ['pantry', 'mleko kokos,makaron,spaghetti,penne,ryz,mak,cukier,sol,olej,oliw,ocet,przypraw,pieprz,passat,koncentrat,konserw,fasol,ciecierzyc,soczewic,kasz,platk,musli,dzem,miod,kawa,herbat,bulion,sos,ketchup,majonez,musztard,pasta curry,curry,kakao,hummus,drozdz,proszek do piecz,tunczyk,kukurydz,groszek,pasta,rice,flour,sugar,salt,oil,vinegar,spice,coffee,tea,stock,sauce,mayo,mustard,beans,cereal,oats,honey,jam,coconut milk'],
  ['bread', 'chleb,bulk,bagiet,rogal,pieczyw,tortill,drozdzowk,paczek,bread,roll,bagel,baguette,croissant,bun'],
  ['dairy', 'mlek,ser,jogurt,masl,smietan,kefir,twarog,jaj,maslank,mozzarell,parmezan,serek,margaryn,skyr,milk,cheese,yogurt,yoghurt,butter,cream,egg'],
  ['veg', 'jablk,banan,pomidor,ogor,ziemniak,cebul,czosn,marchew,salat,papryk,cytryn,limonk,pomarancz,mandaryn,owoc,warzyw,brokul,kapust,pieczark,grusz,winogr,truskaw,borowk,malin,awokado,szpinak,pietrusz,koperek,rzodkiew,por,kalafior,cukini,dyni,burak,seler,imbir,rukol,apple,banana,tomato,potato,onion,garlic,carrot,lettuce,pepper,lemon,lime,orange,fruit,broccoli,mushroom,spinach,avocado,berries,grapes,cucumber'],
];
const strip = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
const RULES = KW.map(([cat, list]) => [cat, list.split(',').map(w => new RegExp(`(^|[^a-z])${w.replace(/ /g, '\\s+')}`))]);
export function guessCat(name) {
  const n = strip(name);
  for (const [cat, res] of RULES) if (res.some(r => r.test(n))) return cat;
  return 'other';
}
export const catLabel = (id, lang) => { const c = CATS[id] || CATS.other; return `${c.e} ${c[lang] || c.en}`; };

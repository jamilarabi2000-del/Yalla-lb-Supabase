export interface GovernorateOption {
  id: string;
  nameEn: string;
  nameAr: string;
  majorCities: string[];
  expressAvailable: boolean;
  baseDeliveryUSD: number;
}

export const LEBANON_REGIONS: GovernorateOption[] = [
  {
    id: 'beirut',
    nameEn: 'Beirut (All Districts)',
    nameAr: 'بيروت (كافة المناطق)',
    majorCities: ['Achrafieh', 'Hamra', 'Mar Mikhael', 'Gemmayze', 'Verdun', 'Badaro', 'Downtown / Solidere', 'Ras Beirut'],
    expressAvailable: true,
    baseDeliveryUSD: 3.0
  },
  {
    id: 'mount_lebanon',
    nameEn: 'Mount Lebanon',
    nameAr: 'جبل لبنان',
    majorCities: ['Jounieh', 'Byblos (Jbeil)', 'Metn (Broummana/Mansourieh)', 'Baabda/Hazmieh', 'Chouf (Deir El Qamar/Beiteddine)', 'Aley', 'Keserwan'],
    expressAvailable: true,
    baseDeliveryUSD: 4.5
  },
  {
    id: 'north',
    nameEn: 'North Lebanon & Akkar',
    nameAr: 'الشمال وعكار',
    majorCities: ['Tripoli (Trablous)', 'Batroun', 'Koura (Amioun/Kousba)', 'Zgharta/Ehden', 'Bcharre', 'Halba'],
    expressAvailable: false,
    baseDeliveryUSD: 5.0
  },
  {
    id: 'south',
    nameEn: 'South Lebanon & Nabatieh',
    nameAr: 'الجنوب والنبطية',
    majorCities: ['Sidon (Saida)', 'Tyre (Sour)', 'Jezzine', 'Nabatieh', 'Marjayoun', 'Bint Jbeil'],
    expressAvailable: false,
    baseDeliveryUSD: 5.5
  },
  {
    id: 'bekaa',
    nameEn: 'Bekaa & Baalbek-Hermel',
    nameAr: 'البقاع وبعلبك الهرمل',
    majorCities: ['Zahlé', 'Chtaura', 'Baalbek', 'West Bekaa (Joub Jannine)', 'Rashaya Al Wadi'],
    expressAvailable: false,
    baseDeliveryUSD: 5.5
  },
  {
    id: 'diaspora_global',
    nameEn: 'International / Diaspora Express (DHL/Aramex)',
    nameAr: 'الشحن الدولي للمغتربين',
    majorCities: ['Dubai & GCC', 'Paris & Europe', 'Montreal & Canada', 'USA', 'London & UK', 'Australia'],
    expressAvailable: true,
    baseDeliveryUSD: 28.0
  }
];

export const LBP_USD_RATE = 89500; // Standard official/market rate for Lebanese Pound

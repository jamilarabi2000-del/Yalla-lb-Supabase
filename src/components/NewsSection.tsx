import React, { useState, useRef, useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import { useDialog } from '../hooks/useDialog';
import { 
  Calendar, 
  X, 
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Pause,
  Play
} from 'lucide-react';

export type NewsCategory = 'all' | 'events' | 'dates' | 'achievements';

interface NewsItem {
  id: string;
  category: 'events' | 'dates' | 'achievements';
  isAnnouncementBanner?: boolean;
  bannerTitle?: string;
  bannerSubtitle?: string;
  titleEn: string;
  titleAr: string;
  excerptEn: string;
  excerptAr: string;
  contentEn: string[];
  contentAr: string[];
  date: string;
  dateAr: string;
  readTimeEn: string;
  readTimeAr: string;
  authorEn: string;
  authorAr: string;
  image: string;
}

const newsData: NewsItem[] = [
  {
    id: 'news-fall-harvest-announcement',
    category: 'dates',
    isAnnouncementBanner: true,
    bannerTitle: 'ANNOUNCEMENT',
    bannerSubtitle: 'TO YALLA.LB COMMUNITY',
    titleEn: 'Registration Fall 2026 Season: Olive & Honey Harvest Pre-Orders Open',
    titleAr: 'فتح باب التسجيل والطلب المسبق لموسم قطاف الزيتون وعسل السنديان خريف ٢٠٢٦',
    excerptEn: 'Official registration and pre-orders are now open for guaranteed single-estate cold-pressed Koura olive oil and organic cedar honey jars.',
    excerptAr: 'بدء استقبال الحجوزات والطلبات المسبقة لموسم زيت الزيتون المعصور على البارد من بساتين الكورة وعسل الأرز الجبلي النقي.',
    contentEn: [
      'We are pleased to announce the opening of pre-orders for the Fall 2026 harvest across all partner artisanal cooperatives in Lebanon.',
      'Members of the Yalla community receive priority dispatch allocation, complimentary batch certificates of purity, and door-to-door delivery with temperature-safe packing.',
      'Ensure your pantry is stocked with genuine first-press virgin oil and raw mountain preserves before seasonal batch allocations close.'
    ],
    contentAr: [
      'يسرنا الإعلان عن فتح باب الحجز المسبق لمنتجات خريف ٢٠٢٦ من مختلف التعاونيات الحرفية اللبنانية الشريكة.',
      'يحصل أعضاء مجتمع يلا على أولوية التوصيل مع شهادات فحص نقاوة الزيت والتغليف الحراري الآمن لباب منزلك.',
      'احجز مخصصاتك من الزيت البكر الممتاز والمؤونة الجبلية الطازجة قبل اكتمال الحصص المتاحة للموسم.'
    ],
    date: 'August 12 2026',
    dateAr: '١٢ آب ٢٠٢٦',
    readTimeEn: '2 min read',
    readTimeAr: 'دقيقتان للقراءة',
    authorEn: 'Community Desk',
    authorAr: 'ديوان المجتمع',
    image: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'news-artisan-syndicate-mou',
    category: 'events',
    titleEn: 'Yalla.lb and Lebanese Heritage Artisans Syndicate signed a Memorandum of Understanding',
    titleAr: 'يلا لبنان ونقابة حرفيي التراث اللبناني يوقعان مذكرة تفاهم استراتيجية',
    excerptEn: 'A landmark partnership expanding fair-trade export pathways, international digital distribution, and mastercraft workshops across Mount Lebanon and the Bekaa.',
    excerptAr: 'اتفاقية تعاون استراتيجية لفتح آفاق التصدير العادل والتوزيع الرقمي ودعم ورش الحرفيين في جبل لبنان والبقاع.',
    contentEn: [
      'In a formal ceremony in Beirut, representatives of Yalla.lb and the Lebanese Heritage Artisans Syndicate ratified a Memorandum of Understanding to support over 140 independent workshops.',
      'The agreement guarantees zero middleman markups for traditional olive wood carvers, glassblowers from Sarafand, and brass coppersmiths from Tripoli.',
      'Together, we are creating sustainable economic stability for master craftsmen while ensuring diaspora patrons receive verified, authentic Lebanese pieces.'
    ],
    contentAr: [
      'في حفل رسمي ببيروت، وقّع ممثلو يلا لبنان ونقابة حرفيي التراث اللبناني مذكرة تفاهم لدعم أكثر من ١٤٠ مشغلاً وورشة عمل مستقلة.',
      'تضمن الاتفاقية إلغاء هوامش الوسطاء لدعم نحاتي خشب الزيتون، نافخي الزجاج في الصرفند، ونحاسي طرابلس القديمة.',
      'نهدف معاً إلى تحقيق الاستدامة الاقتصادية لأصحاب الحرف الأصيلة وتأمين قطع معتمدة وموثقة للمغتربين والجمهور المحلي.'
    ],
    date: 'August 03 2026',
    dateAr: '٠٣ آب ٢٠٢٦',
    readTimeEn: '3 min read',
    readTimeAr: '٣ دقائق للقراءة',
    authorEn: 'Executive Relations',
    authorAr: 'العلاقات المؤسسية',
    image: 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'news-design-thinking-workshop',
    category: 'achievements',
    titleEn: 'Sustainable Craft Packaging & Design Thinking in Action workshop celebration',
    titleAr: 'اختتام ورشة عمل التفكير التصميمي والتغليف المستدام للمنتجات الحرفية',
    excerptEn: 'Honoring the winning design cohort for pioneering 100% biodegradable jute and cedarwood protection for delicate export shipments.',
    excerptAr: 'تكريم الفريق الفائز لابتكاره حلول تغليف صديقة للبيئة من خيش الجوت وألياف الأرز لحماية الشحنات الصادرة.',
    contentEn: [
      'The intensive 4-week "Design Thinking in Action" cohort concluded with awards presented to youth product designers and packaging engineers.',
      'The winning design integrates shock-absorbent cedar shavings and wax-sealed terracotta insulation, drastically reducing freight weight and eliminating single-use plastics.',
      'All winning packaging formats are being deployed immediately across our nationwide and international delivery lines.'
    ],
    contentAr: [
      'اختتمت ورشة "التفكير التصميمي في الميدان" التي استمرت ٤ أسابيع بحفل تكريم وتوزيع جوائز على المصممين الشباب ومهندسي التغليف.',
      'ابتكر الفريق الفائز منظومة تغليف عازلة للصدمات من ألياف الأرز والطين المختوم، مما ساهم في خفض وزن الشحن والتخلص من البلاستيك.',
      'سيتم اعتماد نماذج التغليف الفائزة فوراً في جميع خطوط الشحن المحلية والدولية.'
    ],
    date: 'July 27 2026',
    dateAr: '٢٧ تموز ٢٠٢٦',
    readTimeEn: '4 min read',
    readTimeAr: '٤ دقائق للقراءة',
    authorEn: 'Innovation Lab',
    authorAr: 'مختبر الابتكار',
    image: 'https://images.unsplash.com/photo-1531497865144-0464ef8fb9a9?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'news-state-quality-mou',
    category: 'events',
    titleEn: 'Yalla.lb signed a Quality Assurance Memorandum with the National Food Safety Authority',
    titleAr: 'يلا لبنان توقع بروتوكول جودة وسلامة الغذاء مع الهيئة الوطنية لسلامة الغذاء',
    excerptEn: 'Ensuring rigorous laboratory testing, zero artificial preservatives, and ISO-certified purity standards for all artisanal olive oils and honey.',
    excerptAr: 'تطبيق أعلى معايير الفحص المخبري وضمان خلو المنتجات البلدية والمؤونة من أي مواد حافظة أو إضافات صناعية.',
    contentEn: [
      'To guarantee consumer peace of mind, Yalla.lb has formalized a collaborative quality agreement with accredited national laboratories and agricultural monitoring boards.',
      'Every batch of extra virgin olive oil, mountain blossom honey, and solar-dried zaatar undergoes stringent acidity and purity assays before receiving the official Yalla Quality Seal.',
      'This initiative underscores our commitment to setting the gold standard in authentic Lebanese gourmet retail.'
    ],
    contentAr: [
      'حرصاً على ثقة عملائنا، أبرمت يلا لبنان بروتوكول تعاون لفحص ومراقبة الجودة مع المختبرات المعتمدة وهيئات الرقابة الزراعية.',
      'تخضع كل دفعة من زيت الزيتون البكر الممتاز، عسل الأزهار البرية، والزعتر البلدي لفحوصات دقيقة قبل منحها ختم الجودة المعتمد.',
      'تؤكد هذه الخطوة التزامنا بتقديم أرقى المعايير في تجارة المؤونة والمنتجات الغذائية اللبنانية الأصيلة.'
    ],
    date: 'July 27 2026',
    dateAr: '٢٧ تموز ٢٠٢٦',
    readTimeEn: '3 min read',
    readTimeAr: '٣ دقائق للقراءة',
    authorEn: 'Compliance Board',
    authorAr: 'هيئة المطابقة والجودة',
    image: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'news-tripoli-soap-khan',
    category: 'achievements',
    titleEn: 'Tripoli Khan Al Saboun Guild Honored for 500-Year Heritage Preservation',
    titleAr: 'تكريم نقابة خان الصابون في طرابلس تقديراً لحماية التراث الحرفي العريق',
    excerptEn: 'Master soap artisans celebrated for maintaining chemical-free olive and laurel oil curing vaults and training a new generation of apprentices.',
    excerptAr: 'احتفاء بأساتذة صناعة صابون الغار وزيت الزيتون المعتق في أقبية طرابلس التراثية وتدريب جيل شاب على سر المهنة.',
    contentEn: [
      'The historic Khan Al Saboun in Tripoli has been recognized by international cultural foundations for sustaining ancient soap-curing methods since the 15th century.',
      'Through our exclusive artisan partnership, these hand-stamped botanical soap cakes are now shipped directly to verified buyers worldwide in certified eco-boxes.'
    ],
    contentAr: [
      'نال خان الصابون التاريخي بطرابلس تكريماً دولياً لحفاظه على أسرار تعتيق الصابون الطبيعي منذ القرن الخامس عشر.',
      'من خلال شراكتنا الحصرية، تصل قوالب الصابون المختومة يدوياً مباشرة إلى عشاق المنتجات الطبيعية حول العالم.'
    ],
    date: 'July 19 2026',
    dateAr: '١٩ تموز ٢٠٢٦',
    readTimeEn: '3 min read',
    readTimeAr: '٣ دقائق للقراءة',
    authorEn: 'Heritage Guild',
    authorAr: 'نقابة التراث',
    image: 'https://images.unsplash.com/photo-1608248597261-e4d0450cbf1b?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'news-anfeh-sea-salt-festival',
    category: 'dates',
    titleEn: 'Anfeh White Gold: Summer Sea Salt Harvesting Dates & Artisan Tastings Announced',
    titleAr: 'ذهب أنفه الأبيض: الإعلان عن مواعيد قطاف ملح البحر الصخري وجلسات التذوق',
    excerptEn: 'Join traditional salters on the Mediterranean limestone basins of Anfeh for the pristine summer mineral salt collection and culinary workshop.',
    excerptAr: 'انضم إلى حرفيي استخراج الملح البحري في أحواض أنفه الصخرية لحضور موسم الجمع الصيفي وورش التذوق التراثية.',
    contentEn: [
      'Anfeh\'s historic salinas, carved directly into white sea cliffs, have begun their annual pure sun-evaporated crystallizing cycle.',
      'Limited batches of unprocessed fleur de sel and wild herb salt blends are now scheduled for autumn delivery exclusively on Yalla.lb.'
    ],
    contentAr: [
      'بدأت ملاحات أنفه التاريخية المحفورة في الصخور البيضاء دورتها السنوية لتبخير مياه البحر وإنتاج بلورات الملح النقية.',
      'سيتم توفير كميات محدودة من زهرة الملح الطبيعية وخلاصات الأعشاب البرية حصرياً على منصة يلا لبنان.'
    ],
    date: 'July 14 2026',
    dateAr: '١٤ تموز ٢٠٢٦',
    readTimeEn: '2 min read',
    readTimeAr: 'دقيقتان للقراءة',
    authorEn: 'Coastal Heritage',
    authorAr: 'تراث الساحل',
    image: 'https://images.unsplash.com/photo-1518457607834-6e8d80c183c5?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: 'news-cedar-craft-showcase',
    category: 'events',
    titleEn: 'Bcharreh & Chouf Foresters Launch Annual Sustainable Cedarwood Carving Exhibition',
    titleAr: 'حرفيو بشري والشوف يطلقون المعرض السنوي لمنحوتات خشب الأرز المستدام',
    excerptEn: 'Master carvers showcase reclaimed cedar sculptures, heirloom jewelry chests, and culinary boards sourced strictly from natural pruning programs.',
    excerptAr: 'معرض فني يجمع نخبة النحاتين لتقديم تحف وصناديق خشب الأرز المعمر المستخرج حصرياً من برامج تشذيب الغابات المحمية.',
    contentEn: [
      'Under strict forestry conservation oversight, woodworkers from Bcharreh and the Shouf Biosphere Reserve presented their latest collection of hand-carved heritage crafts.',
      'Each finished piece carries a certified geographical timber tag proving zero harm to living ancient cedar trees.'
    ],
    contentAr: [
      'تحت إشراف محميات الأرز الطبيعية، استعرض حرفيو بشري والشوف تشكيلتهم الجديدة من التحف الخشبية التراثية المنحوتة يدوياً.',
      'تحمل كل قطعة رقماً تسلسلياً يثبت مصدر الخشب المستدام وحماية الأشجار المعمرة.'
    ],
    date: 'June 30 2026',
    dateAr: '٣٠ حزيران ٢٠٢٦',
    readTimeEn: '3 min read',
    readTimeAr: '٣ دقائق للقراءة',
    authorEn: 'Forest Reserve Guild',
    authorAr: 'هيئة محميات الأرز',
    image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=800&q=80'
  }
];

export const NewsSection: React.FC = () => {
  const { language, showToast, siteContent } = useShop();
  const [activeCategory, setActiveCategory] = useState<NewsCategory>('all');
  const [selectedNews, setSelectedNews] = useState<any | null>(null);

  const { containerRef } = useDialog({
    isOpen: !!selectedNews,
    onClose: () => setSelectedNews(null)
  });
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [isAutoPlay, setIsAutoPlay] = useState(false);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const sliderRef = useRef<HTMLDivElement>(null);

  const categories: { id: NewsCategory; labelEn: string; labelAr: string }[] = [
    { id: 'all', labelEn: 'ALL', labelAr: 'الكل' },
    { id: 'events', labelEn: 'PREVIOUS EVENTS', labelAr: 'الفعاليات السابقة' },
    { id: 'dates', labelEn: 'IMPORTANT DATES', labelAr: 'تواريخ ومواعيد هامة' },
    { id: 'achievements', labelEn: 'ACHIEVEMENTS', labelAr: 'الإنجازات والجوائز' }
  ];

  // Convert siteContent articles (or fallback to static newsData) into unified display items
  const cmsArticles = siteContent?.newsSection?.articles;
  const rawArticles = (cmsArticles && cmsArticles.length > 0) ? cmsArticles.filter(a => a.isPublished !== false) : null;

  const normalizedArticles: NewsItem[] = rawArticles ? rawArticles.map(art => {
    // Determine category based on tag or default
    let cat: 'events' | 'dates' | 'achievements' = 'events';
    const tagLower = (art.tag || '').toLowerCase();
    if (tagLower.includes('date') || tagLower.includes('harvest') || tagLower.includes('موسم') || tagLower.includes('تاريخ')) {
      cat = 'dates';
    } else if (tagLower.includes('achievement') || tagLower.includes('award') || tagLower.includes('إنجاز') || tagLower.includes('تكريم')) {
      cat = 'achievements';
    }
    return {
      id: art.id,
      category: cat,
      titleEn: art.title,
      titleAr: art.titleArabic || art.title,
      excerptEn: art.excerpt,
      excerptAr: art.excerptArabic || art.excerpt,
      contentEn: [art.excerpt, 'Explore full artisanal details and verified batch provenance across Yalla.lb.'],
      contentAr: [art.excerptArabic || art.excerpt, 'استكشف تفاصيل الحرفة ومصادر الإنتاج المعتمدة حصرياً عبر منصة يلا لبنان.'],
      date: art.date,
      dateAr: art.dateArabic || art.date,
      readTimeEn: art.readTime,
      readTimeAr: art.readTimeArabic || art.readTime,
      authorEn: art.source,
      authorAr: art.sourceArabic || art.source,
      image: art.imageUrl
    };
  }) : newsData;

  const filteredNews = activeCategory === 'all' 
    ? normalizedArticles 
    : normalizedArticles.filter(item => item.category === activeCategory);

  const updateScrollButtons = () => {
    if (sliderRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = sliderRef.current;
      // In RTL, scrollLeft can be negative or inverted depending on browser
      const maxScroll = scrollWidth - clientWidth;
      const currentScroll = Math.abs(scrollLeft);
      
      setCanScrollLeft(currentScroll > 10);
      setCanScrollRight(currentScroll < maxScroll - 10);

      // Estimate active dot index
      const cardWidth = 300; // approximate card width + gap
      const index = Math.round(currentScroll / cardWidth);
      setActiveSlideIndex(Math.min(index, filteredNews.length - 1));
    }
  };

  useEffect(() => {
    updateScrollButtons();
    const current = sliderRef.current;
    if (current) {
      current.addEventListener('scroll', updateScrollButtons, { passive: true });
      window.addEventListener('resize', updateScrollButtons);
      return () => {
        current.removeEventListener('scroll', updateScrollButtons);
        window.removeEventListener('resize', updateScrollButtons);
      };
    }
  }, [filteredNews]);

  // Handle slide scrolling
  const scrollSlider = (direction: 'left' | 'right') => {
    if (sliderRef.current) {
      const scrollAmount = 340; // width of card + gap
      const multiplier = language === 'ar' 
        ? (direction === 'left' ? 1 : -1) 
        : (direction === 'left' ? -1 : 1);
      
      sliderRef.current.scrollBy({
        left: multiplier * scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  return (
    <section className="bg-[#171717] text-white py-10 sm:py-12 px-4 sm:px-6 lg:px-8 border-t border-b border-[#B89753]/25 select-none relative overflow-hidden">
      
      {/* Background Decorative Ambient Radial Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#B89753_1px,transparent_1px)] [background-size:32px_32px] opacity-10 pointer-events-none" />
      <div className="absolute -left-20 top-0 w-80 h-80 bg-[#B89753]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -right-20 bottom-0 w-80 h-80 bg-[#B89753]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-screen-2xl mx-auto relative z-10">
        
        {/* Section Heading & Slider Controls Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-white">
              {(!siteContent?.newsSection?.title || siteContent.newsSection.title === 'Press, Craft Stories & Cultural News' || siteContent.newsSection.title === 'News & Announcements') ? (
                language === 'ar' ? (
                  <>الأخبار <span className="text-[#B89753] italic">والإعلانات</span></>
                ) : (
                  <>News & <span className="text-[#B89753] italic">Announcements</span></>
                )
              ) : (
                siteContent.newsSection.title
              )}
            </h2>
          </div>

          {/* Slider Navigation Arrows */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => scrollSlider('left')}
              aria-label="Previous Slide"
              disabled={!canScrollLeft && !isAutoPlay}
              className={`w-9 h-9 rounded-lg border border-[#B89753]/30 bg-white/5 text-[#B89753] hover:bg-[#B89753] hover:text-[#171717] hover:border-[#B89753] flex items-center justify-center transition-all duration-200 cursor-pointer shadow-sm disabled:opacity-25 disabled:cursor-not-allowed ${
                language === 'ar' ? 'rotate-180' : ''
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scrollSlider('right')}
              aria-label="Next Slide"
              disabled={!canScrollRight && !isAutoPlay}
              className={`w-9 h-9 rounded-lg border border-[#B89753]/30 bg-white/5 text-[#B89753] hover:bg-[#B89753] hover:text-[#171717] hover:border-[#B89753] flex items-center justify-center transition-all duration-200 cursor-pointer shadow-sm disabled:opacity-25 disabled:cursor-not-allowed ${
                language === 'ar' ? 'rotate-180' : ''
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Horizontal Slider Track Container */}
        <div 
          ref={sliderRef}
          className="flex gap-4 sm:gap-5 overflow-x-auto pb-3 scroll-smooth snap-x snap-mandatory scrollbar-none"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {filteredNews.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedNews(item)}
              className="w-[260px] sm:w-[280px] md:w-[290px] flex-shrink-0 snap-start bg-white rounded-xl border border-[#E5E5E5] hover:border-[#B89753] shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between overflow-hidden cursor-pointer group transform hover:-translate-y-0.5"
            >
              {/* Card Image / Banner Header */}
              <div className="w-full h-36 sm:h-44 relative overflow-hidden bg-neutral-900 flex-shrink-0 flex items-center justify-center">
                <img
                  src={item.image}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-cover blur-md opacity-35 scale-110 pointer-events-none"
                  referrerPolicy="no-referrer"
                />
                <div className="w-full h-full relative z-10 flex items-center justify-center p-2">
                  <img
                    src={item.image}
                    alt={language === 'ar' ? item.titleAr : item.titleEn}
                    className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-500 rounded-md"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
              </div>

              {/* Card Body */}
              <div className="p-4 flex-1 flex flex-col justify-between bg-white text-[#171717]">
                <div>
                  <h3 className="text-xs sm:text-[13px] text-[#171717] font-semibold line-clamp-2 min-h-[36px] group-hover:text-[#8F7137] transition-colors leading-snug">
                    {language === 'ar' ? item.titleAr : item.titleEn}
                  </h3>
                </div>

                <div className="mt-3 pt-2">
                  <div className="w-full bg-[#E5E5E5] h-[1px] relative mb-2">
                    <div className={`absolute top-0 w-8 h-[1.5px] bg-[#B89753] ${language === 'ar' ? 'right-0' : 'left-0'}`} />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#8F7137] font-medium">
                    <span>{language === 'ar' ? item.dateAr : item.date}</span>
                  </div>
                </div>

              </div>
            </div>
          ))}
        </div>

        {/* Slider Pagination Dots */}
        <div className="mt-3 flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center gap-1.5">
            {filteredNews.map((_, idx) => (
              <span
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  activeSlideIndex === idx
                    ? 'w-6 bg-[#B89753]'
                    : 'w-2 bg-white/20'
                }`}
              />
            ))}
          </div>

          <div className="text-[11px] text-[#B89753]/80 hidden sm:flex items-center gap-2">
            <span>{language === 'ar' ? 'اسحب للتنقل بين الأخبار والإعلانات' : 'Scroll or use arrows to view all stories'}</span>
          </div>
        </div>

      </div>

      {/* Modal View for full news narrative */}
      {selectedNews && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div 
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            className="bg-[#171717] text-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative border border-[#B89753]/30 focus:outline-hidden"
          >
            
            <div className="relative h-60 sm:h-72 w-full overflow-hidden bg-neutral-900 flex items-center justify-center">
              <img 
                src={selectedNews.image} 
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover blur-lg opacity-35 scale-110 pointer-events-none"
                referrerPolicy="no-referrer"
              />
              <img 
                src={selectedNews.image} 
                alt={language === 'ar' ? selectedNews.titleAr : selectedNews.titleEn}
                className="relative z-10 max-h-full max-w-full object-contain p-4 drop-shadow-md"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 z-20 bg-gradient-to-t from-[#171717] via-black/30 to-transparent pointer-events-none" />
              <button 
                onClick={() => setSelectedNews(null)}
                className="absolute top-4 right-4 z-30 p-2 rounded-lg bg-black/60 hover:bg-black text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="absolute bottom-4 left-6 right-6 z-30 text-white space-y-1.5">
                <span className="inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[#B89753] text-white">
                  {selectedNews.category.toUpperCase()}
                </span>
                <h2 className="text-lg sm:text-xl font-serif font-bold leading-snug text-white">
                  {language === 'ar' ? selectedNews.titleAr : selectedNews.titleEn}
                </h2>
              </div>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
              <div className="flex items-center justify-between text-xs text-neutral-400 pb-3 border-b border-white/10">
                <span className="flex items-center gap-1.5 font-medium text-[#B89753]">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? selectedNews.dateAr : selectedNews.date}</span>
                </span>
                <span className="font-semibold text-neutral-300">
                  {language === 'ar' ? selectedNews.authorAr : selectedNews.authorEn}
                </span>
              </div>

              <div className="space-y-4 text-sm sm:text-base text-neutral-300 leading-relaxed font-normal">
                {(language === 'ar' ? selectedNews.contentAr : selectedNews.contentEn).map((paragraph: string, index: number) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>

              <div className="pt-4 border-t border-white/10 flex items-center justify-end">
                <button
                  onClick={() => setSelectedNews(null)}
                  className="px-6 py-2.5 rounded-lg bg-[#B89753] hover:bg-[#8F7137] text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  {language === 'ar' ? 'إغلاق' : 'Close'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </section>
  );
};

import type { TranslationShape } from "./en";

/**
 * Kurmanji Kurdish (Latin script). Machine/best-effort translation —
 * flagged for native-speaker review before release, see docs/DECISIONS.md.
 */
const ku: TranslationShape = {
  common: {
    back: "Vegere",
    cancel: "Betal bike",
    remove: "Rake",
    save: "Tomar bike",
    search: "Lêgerîn",
    loading: "Bar dibe…",
    retry: "Dîsa biceribîne",
    refreshFailed: "Nuha nûvekirin bi ser neket — ji bo dîsa ceribandinê berjêr bikişîne.",
    noInternet: "Girêdana internetê tune ye.",
    providerUnreachable: "Servera pêşkêşkar niha bersiv nade. Piştî kêliyekê dîsa biceribîne.",
    confirm: "Piştrast bike",
    clear: "Paqij bike",
    edit: "Biguherîne",
    add: "Zêde bike",
    connect: "Girê bide",
    accept: "Qebûl bike",
    previous: "Bere",
    next: "Pêş",
    ok: "Baş e",
    later: "Paşê",
    yes: "Erê",
    no: "Na",
    justNow: "Niha",
    minutesAgo: "{n} deqe berê",
    hoursAgo: "{n} saet berê",
    daysAgo: "{n} roj berê",
  },

  onboarding: {
    skip: "Derbas bike",
    next: "Pêş",
    getStarted: "Dest pê bike",
    slide1Title: "TV ya Zindî, Fîlim û Rêzefîlim",
    slide1Body: "Her tişta ku dabînkerê te yê IPTV pêşkêş dike, li cihekî hatî rêkxistin û lêgerîn.",
    slide2Title: "Ji bo guherandina kanalan a bilez hatiye çêkirin",
    slide2Body: "Di navbera kanalan de yekser derbas bibe, bi lîstikvanek ku ji bo vê yekê hatiye çêkirin.",
    slide3Title: "Dabînkerê te, daneyên te",
    slide3Body:
      "Mooj TV tenê naveroka dabînkerê ku tu pê ve girêdayî yî lêdide — tiştek ji derveyî amûra te nayê tomarkirin an parvekirin.",
  },

  legal: {
    title: "Mercên Bikaranînê",
    acceptButton: "Qebûl bike û Berdewam bike",
    accepted: "Hate qebûlkirin",
    lastUpdatedLabel: "Rojanekirina dawî",
    lastUpdatedDate: "2026-03-26",
    eulaTitle: "Peymana Lîsansê ya Bikarhênerê Dawî (EULA)",
    tosTitle: "Şertên Xizmetê",
    dmcaTitle: "Agahdariya Mafê Nivîskar / DMCA",
    sections: {
      scopeAndAcceptance: {
        heading: "Qebûlkirin û qada şertan",
        body: [
          "Ev şert (bi nav de EULA, Şertên Xizmetê û Agahdariya Mafê Nivîskar/DMCA) bikaranîna te ya Mooj TV (\"Sepan\") rêk dide. Bi daxistin, sazkirin, gihîştin an bikaranînê, tu van şertan qebûl dikî.",
          "Heke tu qebûl nakî, Sepanê bikar neynî.",
        ],
      },
      noContentProvided: {
        heading: "Naverok nayê peydakirin an barandin",
        body: [
          "Sepan tenê amûrek lîstina medyayê ye. Sepan bi awayek standard tu naverokê, kanal an playlistê nakeve nav, napeşkêş dike, nafiroşe, lîsans nade, nadabeş dike an jî naşîne.",
          "Pêşdebir naverokê/barandinê (media, playlist, kanal an stream) nakin û tu karûbarê IPTV naşopînin.",
        ],
      },
      userProvidedContent: {
        heading: "Tenê naveroka ku bikarhêner têxe",
        body: [
          "Ji bo bikaranîna Sepanê, divê tu çavkaniyên xwe yên naverokê pêşkêş bikî, mîna agahiyên Xtream Codes an URL-ên streamê yên rasterast, ji serverên ku tu kontrol dikî an mafê gihîştinê ya wan heye.",
          "Tu îkrar û garantî dikî ku ji bo gihîştin û bikaranîna her naverokê ku tu têxî Sepanê, hemî maf, lîsans û destûrên pêwîst hene.",
        ],
      },
      userResponsibility: {
        heading: "Berpirsyariya bikarhêner (qanûnî û mafên nivîskar)",
        body: [
          "Tu bi tenê û bi temamî (%100) berpirsyar î ji bo qanûnîbûna naveroka ku tu bi Sepanê digihîjî, dişînî an nîşan didî, di nav de peywira rêzgirtina qanûnên mafê nivîskar li herêmê te.",
          "Tu qebûl dikî ku Sepanê ji bo gihîştina naveroka neqanûnî, bêdestûr an têkçûyî ya mafên nivîskar bikar neynî û gihîştinê jî hêsan neke.",
        ],
      },
      noAffiliation: {
        heading: "Têkiliyê/anîna piştgirî tune ye",
        body: [
          "Pêşdebir ne difroşin, ne piştgirî dikin, ne sponsor dikin û ne jî bi tu pêşkêşkerên IPTV an karûbarên medyayî yên derve re têkiliyê heye.",
          "Her têkilî/şîrove li ser aliyên sêyem ji bo hevgirtin an danasînê ye û wateya hevkarî an pejirandinê nake.",
        ],
      },
      prohibitedUses: {
        heading: "Bikaranînên qedexe",
        body: [
          "Tu divê Sepanê ji bo têkçûna tu qanûn an rêzikê (di nav de mafê nivîskar) bikar neynî.",
          "Tu divê playlist/streamên ku maf têk dikin bi Sepanê bar nekî, parve nekî, reklam nekî an bilind nekî.",
          "Tu divê hewl nedî ku ewlehî, kontrolên gihîştinê, DRM, sînorkirinên cîhî an sînorkirinên torê derbas bikî an têk bibî.",
          "Tu divê reverse engineering, decompile an hewlên derxistina source codeê ji Sepanê nekî, ji bilî ku qanûn destûr bide.",
        ],
      },
      thirdPartyServices: {
        heading: "Karûbarên aliyên sêyem û lînkan",
        body: [
          "Sepan dikare destûr bide ku tu bi server/karûbarên aliyên sêyem re girê bidî ku tu xwe saz dikî. Ew aliyên sêyem di kontrola pêşdebiran de nîne û şert û siyaseta taybetiyê ya xwe hene.",
          "Pêşdebir berpirsyar nabin ji bo naveroka aliyên sêyem, amadebûna wan, kalîte, qanûnîbûn an zirarên ku ji bikaranîna te ya wan tê.",
        ],
      },
      termination: {
        heading: "Dawîkirin",
        body: [
          "Mafê te yê bikaranîna Sepanê dikare were rawestandin an dawîkirin heke tu van şertan têk bibî an heke qanûn pêwîst bike.",
          "Piştî dawîkirinê, divê tu Sepanê bikar neynî. Beşên ku divê piştî dawîkirinê jî bimînin (wate feragî, sînorkirina berpirsyariyê, tazmîn û qanûna serdest) dê bimînin.",
        ],
      },
      disclaimers: {
        heading: "Feragî (disclaimer)",
        body: [
          "SEPAN \"WEKÎ YE\" Û \"WEKÎ HEYE\" TÊ PÊŞKÊŞKIRIN, BÊ GARANTÎYA HER CUREYÊ (AŞKIR, NEXWEŞAN, AN QANÛNÎ), DI NAV DE GARANTÎYA FROŞBARÎBÛNÊ, GUNCAVBÛNA ARMANCEKÊ, Û NE-TÊKÇÛNA MAFAN.",
          "Pêşdebir garantî nakin ku Sepan bêqutî, bêxelet, ewle an bi hemû cîhaz û çavkaniyên naverokê re guncav be.",
        ],
      },
      limitationOfLiability: {
        heading: "Sînorkirina berpirsyariyê",
        body: [
          "Di çarçoveya ku qanûn destûr dide, pêşdebir ji zirarên ne-rasterast, tesadufî, taybet, peywendîdar, nimûneyî an cezayî, an ji windabûna qazanc, dahat, daneyên an navdariyê, ku ji bikaranîna Sepanê tê an bi wê re têkildar e, berpirsyar nabin.",
          "Heke berpirsyarî nayê nehiştin, berpirsyariya giştî ya pêşdebir dê bi wateya pereya ku te ji bo Sepanê daye (heger hebe) di 12 mehan berê de, sînorkirin bibe.",
        ],
      },
      indemnification: {
        heading: "Tazmîn (indemnification)",
        body: [
          "Tu qebûl dikî ku pêşdebiran biparêzî, tazmîn bikî û ji her daxwaz, zirar, berpirsyarî, windahî û lêçûn (di nav de mûçeya parêzeran a maqûl) ku ji çavkaniyên naveroka te, bikaranîna te ya Sepanê an têkçûna şertan/qanûn tê, azad bikî.",
        ],
      },
      dmcaNotice: {
        heading: "Têbînîya mafê nivîskar / DMCA (barandin tune ye)",
        body: [
          "Pêşdebir naverokê nayên barandin, nayên tomar kirin, nayên şandin an nayên belav kirin. Sepan tenê naveroka ku bikarhêner têxî an ku serverên aliyên sêyem (ku bikarhêner saz kiriye) pêşkêş dikin lîstin dike.",
          "Heke tu bawerî ku naveroka ku bi Sepanê tê gihîştin mafê nivîskar têk dike, divê tu şikayetê xwe bi rastî bi hosting provider an operatorê serverê ku naverokê tomar dike/dişîne re bikî, ne bi pêşdebirên Sepanê re.",
        ],
      },
      dmcaHowToSubmit: {
        heading: "Şandina agahdariya mafê nivîskar",
        body: [
          "Heke dîsa pêwîst be ku tu bi pêşdebiran re li ser mafê nivîskar têkilî daynî, ji kerema xwe agahdariyek bi emailê li jêr bişîne û tê de: (a) nasandina karê parastî; (b) nasandina materyala têgihiştina têkçûnê (bi agahiyên têra ku were dîtin, di nav de server/URL); (c) agahiyên têkiliyê; (d) daxuyaniya baweriyê ya bi dilpakî; (e) daxuyaniya bi tawanbarî ku agahdarî rast e û tu xwediyê mafê an agentê destûrdayî yî.",
        ],
      },
      governingLaw: {
        heading: "Qanûna serdest û dadgeh",
        body: [
          "Ev şert bi qanûnên Dewleta Delaware, Dewletên Yekbûyî yên Amerîkayê tê rêvebirin, bê ku prensîbên tevlihevîya qanûnan were binirxandin.",
          "Tu qebûl dikî ku her nakokî ku ji Sepanê an van şertan tê an bi wan re têkildar e, li dadgehên eyaletî an federal ên li Delaware were anîn, û tu qebûlîya desthilatdariya wan dide.",
        ],
      },
      contact: {
        heading: "Têkilî",
        body: ["Ji bo pirsên yasayî (di nav de agahdariyên mafê nivîskar), têkilî bike:", "Email: support@mooj-player.com"],
      },
    },
  },

  providers: {
    title: "Dabînker",
    tagline: "Hemû kanal, fîlm û rêzefîlmên te li yek cihî.",
    addProvider: "+ Dabînkerekê Zêde Bike",
    noProvidersYet: "Hê tu dabînker tune.",
    active: "Çalak",
    neverConnected: "Çu carî ne girêdayî bû",
    removeTitle: "Dabînkerê rake",
    removeBody: '"{name}" bê rakirin? Ev kiryar nayê vegerandin.',
    connectError: "Nekarî bi vî dabînkerî ve were girêdan.",
    edit: "Biguherîne",
    connect: "Têkeve",
  },

  addProvider: {
    title: "Dabînkerekê Zêde Bike",
    unreachable: "Nekarî bigihîje vê serverê. Navnîşan û girêdana xwe kontrol bike.",
    subtitle: "Agahiyên têketina xwe yên Xtream Codes binivîse.",
    editTitle: "Dabînkerê Biguherîne",
    typeXtream: "Xtream Codes",
    typeRemoteM3U: "M3U ya Dûr",
    typeLocalM3U: "Pelê M3U yê Herêmî",
    nameLabel: "Nav (vebijarkî)",
    namePlaceholder: "Dabînkerê Min",
    defaultName: "Hesabê min",
    serverUrlLabel: "URL a Rajekar",
    serverUrlPlaceholder: "http://mînak.com:8080",
    usernameLabel: "Navê bikarhêner",
    passwordLabel: "Şîfre",
    show: "Nîşan bide",
    hide: "Veşêre",
    connectButton: "Girê bide",
    saveButton: "Tomar bike",
    m3uUrlLabel: "URL a Lîsteyê",
    m3uUrlPlaceholder: "http://mînak.com/playlist.m3u8",
    chooseFileButton: "Pelê hilbijêre",
    noFileChosen: "Tu pel nehatiye hilbijartin",
    noVodEmpty: "Girêdan çêbû, lê vî dabînkerî tu kanalên zindî venegerandin.",
  },

  /*
   * The bottom tab bar's own two labels.
   *
   * Live, Movies and Series are not repeated here: the bar reads them from
   * `home`, so renaming a section renames it everywhere at once.
   */
  tabs: {
    home: "Serrûpel",
    more: "Zêdetir",
  },

  home: {
    welcomeBack: "Tu bi xêr hatî",
    search: "Lêgerîn",
    browse: "Bigere",
    liveTV: "TV ya Zindî",
    movies: "Fîlim",
    series: "Rêzefîlim",
    quickActions: "Kiryarên Bilez",
    favorites: "Bijarte",
    watchLater: "Paşê Temaşe Bike",
    settings: "Mîhengên",
    downloads: "Daxistin",
    topRated: "Herî bilind",
    newIn: "Nû di",
    featured: "Hilbijartî",
    continueWatching: "Temaşekirinê Berdewam Bike",
    seeAll: "Hemûyan Bibîne",
    noWatchHistory: "Hê dîroka temaşekirinê tune",
    clear: "Paqij bike",
    clearHistoryTitle: "Dîroka temaşekirinê paqij bike",
    clearHistoryBody: "Hemû tomarên \"Temaşekirinê Berdewam Bike\" bên rakirin? Ev kiryar nayê vegerandin.",
  },

  history: {
    title: "Dîroka Temaşekirinê",
    empty: "Hê dîroka temaşekirinê tune.",
  },


  liveCategories: {
    title: "TV ya Zindî",
    allCategory: "Hemû",
    chooseCategory: "Kategoriyekê hilbijêre",
  },

  liveChannelList: {
    channelsCountSuffix: "kanal",
    searchPlaceholder: "Li kanalan bigere",
    liveBadge: "ZINDÎ",
    noChannelsAvailable: "Tu kanal berdest nîne.",
  },

  liveGuide: {
    guideButtonLabel: "Kanal",
    title: "Kanal",
    thisCategoryTab: "Vê Kategoriyê",
    allChannelsTab: "Hemû Kanalan",
    noResults: "Kanal nehat dîtin.",
    close: "Bigire",
  },

  livePlayer: {
    previousChannel: "Berê",
    nextChannel: "Pêş",
    play: "Lêxe",
    pause: "Rawestîne",
    subtitles: "Jêrnivîs",
    audio: "Deng",
    mute: "Bêdeng",
    unmute: "Deng veke",
    aspectFit: "Bicihîne",
    aspectFill: "Tije bike",
    aspectStretch: "Dirêj bike",
    streamPaused: "Ev weşan ji bo niha rawestiyaye. Divê di demek kurt de vegere.",
    playbackBusy: "Weşan kêliyekê mijûl e. Hinekî bisekine an kanaleke din biceribîne.",
    playbackOffAir: "Ev kanal niha weşan nake. Kanaleke din biceribîne.",
    playbackSlow: "Girêdan hêdî ye an jî qut bûye. Tora xwe kontrol bike û dîsa biceribîne.",
    playbackUnsupported: "Ev kanal formatek bi kar tîne ku amûra te nikare lê bide.",
    playbackUnknown: "Ev kanal niha dest pê nake. Kanaleke din biceribîne, an piştî demek kurt dîsa.",
    vodBusy: "Lêdan ji bo kêliyekê mijûl e. Hinekî bisekine û dîsa biceribîne.",
    vodMissing: "Ev berhem niha li cem pêşkêşkar tune ye.",
    vodSlow: "Girêdan hêdî ye an jî qut bûye. Tora xwe kontrol bike û dîsa biceribîne.",
    vodUnsupported: "Ev pel formatek bi kar tîne ku amûra te nikare lê bide.",
    vodUnknown: "Ev berhem niha nayê lîstin. Piştî demek kurt dîsa biceribîne.",
    sleepTimer: "Demjimêra xewê",
    sleepOff: "Girtî",
    channelNumber: "Here kanalê",
  },

  moviesCategories: {
    title: "Fîlim",
  },

  moviesGrid: {
    title: "Fîlim",
    moviesCountSuffix: "fîlim",
    searchPlaceholder: "Li fîliman bigere",
  },

  movieDetails: {
    play: "Lêbide",
    favorite: "Bijarte",
    favorited: "Di Bijarteyan de",
    addWatchLater: "Paşê Temaşe Bike",
    inWatchLater: "Di Paşê Temaşe Bike de",
    plot: "Naverok",
    cast: "Lîstikvan",
    director: "Derhêner",
    download: "Dakêşe",
    downloaded: "Hatiye Dakêşin",
  },

  seriesCategories: {
    title: "Rêzefîlim",
  },

  seriesGrid: {
    title: "Rêzefîlim",
    seriesCountSuffix: "rêzefîlim",
    searchPlaceholder: "Li rêzefîlman bigere",
  },

  seriesDetails: {
    play: "Lêbide",
    favorite: "Bijarte",
    favorited: "Di Bijarteyan de",
    addWatchLater: "Paşê Temaşe Bike",
    inWatchLater: "Di Paşê Temaşe Bike de",
    plot: "Naverok",
    cast: "Lîstikvan",
    director: "Derhêner",
    noEpisodesAvailable: "Tu beş berdest nîne.",
    seasonsSuffix: "sezon",
    episodesTitle: "Beş",
    episodesSuffix: "beş",
  },

  episodePlayer: {
    nextEpisodeIn: "Beşa pêş de {n} çirkeyan de",
    dismiss: "Deyne aliyekî",
    playNow: "Niha Lêbide",
    episodeNotFound: "Beş nehat dîtin.",
  },

  moviePlayer: {
    movieNotFound: "Fîlim nehat dîtin.",
  },

  trackSelector: {
    audio: "Deng",
    subtitles: "Bînavîs",
    off: "Girtî",
    close: "Bigire",
    tracksButton: "Track",
    unknown: "Nenas",
    noAudioTracks: "Tu rêça dengî ya din tune.",
    noSubtitleTracks: "Tu binnivîs tune.",
  },

  search: {
    title: "Lêgerîn",
    placeholder: "Li TV ya zindî, fîlim, rêzefîlman bigere",
    preparingSearch: "Lêgerîn tê amadekirin…",
    typeToSearch: "Ji bo lêgerîna di TV ya Zindî, Fîlim û Rêzefîlman de binivîse.",
    noResultsFor: 'Ji bo "{query}" tu encam nehat dîtin.',
    live: "ZINDÎ",
    movie: "FÎLIM",
    series: "RÊZEFÎLIM",
  },

  library: {
    favoritesTitle: "Bijarte",
    watchLaterTitle: "Paşê Temaşe Bike",
    nothingHereYet: "Hê tiştek li vir tune.",
  },

  downloads: {
    title: "Daxistin",
    empty: "Hê tu daxistin tune.",
    queued: "Di rêzê de",
    downloading: "Tê dakêşin",
    paused: "Hatiye rawestandin",
    completed: "Qediya",
    failed: "Serneket",
    canceled: "Hate betalkirin",
    pause: "Rawestîne",
    resume: "Berdewam bike",
    cancel: "Betal bike",
    delete: "Jê bibe",
    deleteConfirmTitle: "Daxistinê jê bibe",
    deleteConfirmBody: 'Pelê hatiye dakêşin ê "{title}" bê jêbirin? Ev kiryar nayê vegerandin.',
    download: "Dakêşe",
    notEligible: "Ev tişt nikare bê dakêşin.",
    alreadyDownloaded: "Berê hatiye dakêşin",
  },

  parental: {
    title: "Kilîta dêûbav",
    enterPin: "PIN'ê binivîse",
    setPin: "PIN'eke 4 hejmarî diyar bike",
    changePin: "PIN'ê biguherîne",
    removePin: "PIN'ê rake",
    wrongPin: "PIN çewt e",
    lockCategories: "Ji bo xuyabûna kategoriyan PIN bixwaze",
    lockCategoriesNote: "Kategoriyên veşartî tenê bi PIN vedibin.",
    noPinYet: "Pêşî PIN'ekê diyar bike",
  },

  update: {
    requiredTitle: "Nûkirin pêwîst e",
    requiredBody:
      "Guhertoyeke nû hat weşandin û ev guherto êdî nikare bixebite. Ji bo berdewamkirinê sepanê nû bike.",
    updateNow: "Niha nû bike",
    availableTitle: "Nûkirineke nû heye",
    availableBody: "Guhertoyeke nûtir a Mooj TV derket, bi baştirkirin û serrastkirinan. Niha nû bike.",
    later: "Paşê",
  },
  settings: {
    title: "Mîhengên",
    appearance: "Xuyabûn",
    yourActivity: "Çalakiya te",
    language: "Ziman",
    theme: "Dirb",
    themeDark: "Tarî",
    themeLight: "Ronî",
    themeSystem: "Li gorî pergalê",
    content: "Naverok",
    showLiveSection: "Beşa TV ya Zindî nîşan bide",
    showMoviesSection: "Beşa Fîliman nîşan bide",
    showSeriesSection: "Beşa Rêzefîlman nîşan bide",
    manageCategoryVisibility: "Xuyabûna kategoriyan birêve bibe",
    accountProvider: "Ajimêr / Dabînker",
    provider: "Dabînker",
    server: "Rajekar",
    username: "Navê bikarhêner",
    accountStatus: "Rewşa ajimêr",
    expiresOn: "Dawî",
    neverExpires: "Bêdawî",
    connections: "Girêdan",
    outputFormats: "Formatên derketinê",
    serverTimezone: "Herêma demê ya rajekar",
    manageProviders: "Dabînkeran birêve bibe",
    disconnect: "Girêdanê veqetîne",
    disconnectConfirmBody: "Ji vî pêşkêşkarî derkevî? Pêşkêşkarên te yên tomarkirî û pirtûkxaneya te li vê amûrê dimînin.",
    playback: "Lêdan",
    modernChannelView: "Dîmena nûjen a kanalan",
    modernChannelViewNote: "Dema tu li kanalan digerî wêne li ser ekranê dimîne, li şûna lêdereke tije ekran.",
    resumePlayback: "Lêdanê berdewam bike",
    autoplayNextEpisode: "Beşa pêş de bixweber lêbide",
    preferredAudio: "Zimanê dengî yê tercîhkirî",
    preferredSubtitle: "Zimanê bînavîsê yê tercîhkirî",
    storage: "Depo",
    downloadedContent: "Naveroka hatiye dakêşin",
    manageDownloads: "Daxistinan birêve bibe",
    data: "Daneyan",
    clearWatchHistory: "Dîroka temaşekirinê paqij bike",
    clearFavorites: "Bijarteyan paqij bike",
    clearWatchLater: "Paşê Temaşe Bike paqij bike",
    clearConfirmBody: "Ev kiryar nayê vegerandin.",
    legal: "Yasayî",
    termsConditions: "Mercên Bikaranînê",
    diagnostics: "Teşxîs",
    playerDiagnostics: "Teşxîsa lîstikvan",
    about: "Derbarê",
    appVersion: "Guhertoya sepanê",
    package: "Pakêt",
    restartRequiredTitle: "Ji nû ve destpêkirin pêwîst e",
    restartRequiredBody:
      "Rêzkirina rast-ber-çep tenê dema sepan dest pê dike diguhere. Niha bigire û ji nû ve veke, an jî bidomîne û cara pêş de wê were sepandin.",
    restartNow: "Niha bigire",
    backgroundPlayback: "Di paşperdeyê de lêxistinê bidomîne",
    backgroundPlaybackNote: "Bi bingehîn girtî ye: weşana vekirî girêdana pêşkêşkar digire.",
    parentalLock: "Kilîta dêûbav",
    clearImageCache: "Wêneyên hilanîn paqij bike",
  },

  categoryVisibility: {
    title: "Kategorî",
    searchPlaceholder: "Li kategoriyekê bigere",
  },
};

export default ku;

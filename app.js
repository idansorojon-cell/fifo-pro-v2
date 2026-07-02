/**
 * FIFO PRO — app.js
 * Global state, initialization, tab routing
 * Depends on: utils.js, api.js
 */

// ── SEED DATA (108 historical trades) ──────────────────────
const SEED = [
  {id:1,symbol:"QBTS",buy_date:"10/03/2025",sell_date:"14/03/2025",qty:350,buy_price:4.88,sell_price:9.85,cost:1708,gross:1739.5,tax:434.88,net:1304.62,pct:101.84,month:"2025-03",hold_days:4,notes:""},
  {id:2,symbol:"INTC",buy_date:"05/03/2025",sell_date:"19/03/2025",qty:177,buy_price:20.38,sell_price:24.12,cost:3607.26,gross:661.98,tax:165.5,net:496.48,pct:18.35,month:"2025-03",hold_days:14,notes:""},
  {id:3,symbol:"QBTS",buy_date:"10/03/2025",sell_date:"19/03/2025",qty:450,buy_price:4.88,sell_price:10.62,cost:2196,gross:2583,tax:645.75,net:1937.25,pct:117.62,month:"2025-03",hold_days:9,notes:""},
  {id:4,symbol:"MU",buy_date:"19/03/2025",sell_date:"24/03/2025",qty:33,buy_price:101,sell_price:96.85,cost:3333,gross:-136.95,tax:-34.24,net:-102.71,pct:-4.11,month:"2025-03",hold_days:5,notes:""},
  {id:5,symbol:"ARM",buy_date:"19/03/2025",sell_date:"31/03/2025",qty:34,buy_price:120,sell_price:105.06,cost:4080,gross:-507.96,tax:-126.99,net:-380.97,pct:-12.45,month:"2025-03",hold_days:12,notes:""},
  {id:6,symbol:"MU",buy_date:"19/03/2025",sell_date:"31/03/2025",qty:1,buy_price:101,sell_price:64.98,cost:101,gross:-36.02,tax:-9.01,net:-27.01,pct:-35.66,month:"2025-03",hold_days:12,notes:""},
  {id:7,symbol:"MU",buy_date:"19/03/2025",sell_date:"31/03/2025",qty:34,buy_price:102.36,sell_price:64.98,cost:3480.24,gross:-1270.92,tax:-317.73,net:-953.19,pct:-36.52,month:"2025-03",hold_days:12,notes:""},
  {id:8,symbol:"NVDA",buy_date:"01/04/2025",sell_date:"16/04/2025",qty:35,buy_price:109.55,sell_price:104,cost:3834.25,gross:-194.25,tax:-48.56,net:-145.69,pct:-5.07,month:"2025-04",hold_days:15,notes:""},
  {id:9,symbol:"NVDA",buy_date:"10/04/2025",sell_date:"16/04/2025",qty:22,buy_price:108.7,sell_price:104,cost:2391.4,gross:-103.4,tax:-25.85,net:-77.55,pct:-4.32,month:"2025-04",hold_days:6,notes:""},
  {id:10,symbol:"NFLX",buy_date:"17/04/2025",sell_date:"22/04/2025",qty:5,buy_price:971.68,sell_price:1058.02,cost:4858.4,gross:431.7,tax:107.93,net:323.77,pct:8.89,month:"2025-04",hold_days:5,notes:""},
  {id:11,symbol:"QBTS",buy_date:"03/04/2025",sell_date:"24/04/2025",qty:500,buy_price:6.96,sell_price:7.37,cost:3480,gross:205,tax:51.25,net:153.75,pct:5.89,month:"2025-04",hold_days:21,notes:""},
  {id:12,symbol:"NVDA",buy_date:"23/04/2025",sell_date:"25/04/2025",qty:50,buy_price:103.66,sell_price:110.97,cost:5183,gross:365.5,tax:91.38,net:274.12,pct:7.05,month:"2025-04",hold_days:2,notes:""},
  {id:13,symbol:"AMZN",buy_date:"01/05/2025",sell_date:"02/05/2025",qty:50,buy_price:190,sell_price:190.75,cost:9500,gross:37.5,tax:9.38,net:28.12,pct:0.39,month:"2025-05",hold_days:1,notes:""},
  {id:14,symbol:"QBTS",buy_date:"07/05/2025",sell_date:"08/05/2025",qty:300,buy_price:6.94,sell_price:9.27,cost:2082,gross:699,tax:174.75,net:524.25,pct:33.57,month:"2025-05",hold_days:1,notes:""},
  {id:15,symbol:"QBTS",buy_date:"07/05/2025",sell_date:"08/05/2025",qty:200,buy_price:7.05,sell_price:9.27,cost:1410,gross:444,tax:111,net:333,pct:31.49,month:"2025-05",hold_days:1,notes:""},
  {id:16,symbol:"QBTS",buy_date:"07/05/2025",sell_date:"08/05/2025",qty:500,buy_price:7.05,sell_price:9,cost:3525,gross:975,tax:243.75,net:731.25,pct:27.66,month:"2025-05",hold_days:1,notes:""},
  {id:17,symbol:"SOUN",buy_date:"06/05/2025",sell_date:"12/05/2025",qty:415,buy_price:8.94,sell_price:11,cost:3710.1,gross:854.9,tax:213.73,net:641.17,pct:23.04,month:"2025-05",hold_days:6,notes:""},
  {id:18,symbol:"SOUN",buy_date:"06/05/2025",sell_date:"12/05/2025",qty:140,buy_price:8.94,sell_price:11.01,cost:1251.6,gross:289.8,tax:72.45,net:217.35,pct:23.15,month:"2025-05",hold_days:6,notes:""},
  {id:19,symbol:"SOUN",buy_date:"06/05/2025",sell_date:"12/05/2025",qty:275,buy_price:8.85,sell_price:11.01,cost:2433.75,gross:594,tax:148.5,net:445.5,pct:24.41,month:"2025-05",hold_days:6,notes:""},
  {id:20,symbol:"CEP",buy_date:"19/05/2025",sell_date:"19/05/2025",qty:300,buy_price:34.04,sell_price:36,cost:10212,gross:588,tax:147,net:441,pct:5.76,month:"2025-05",hold_days:0,notes:""},
  {id:21,symbol:"QBTS",buy_date:"21/05/2025",sell_date:"21/05/2025",qty:500,buy_price:16.92,sell_price:16.01,cost:8460,gross:-455,tax:-113.75,net:-341.25,pct:-5.38,month:"2025-05",hold_days:0,notes:""},
  {id:22,symbol:"CEP",buy_date:"22/05/2025",sell_date:"22/05/2025",qty:300,buy_price:48.5,sell_price:49.7,cost:14550,gross:360,tax:90,net:270,pct:2.47,month:"2025-05",hold_days:0,notes:""},
  {id:23,symbol:"OKLO",buy_date:"23/05/2025",sell_date:"23/05/2025",qty:300,buy_price:44,sell_price:45.85,cost:13200,gross:555,tax:138.75,net:416.25,pct:4.2,month:"2025-05",hold_days:0,notes:""},
  {id:24,symbol:"JTAI",buy_date:"27/05/2025",sell_date:"27/05/2025",qty:2000,buy_price:4.41,sell_price:4.07,cost:8820,gross:-680,tax:-170,net:-510,pct:-7.71,month:"2025-05",hold_days:0,notes:""},
  {id:25,symbol:"JTAI",buy_date:"27/05/2025",sell_date:"27/05/2025",qty:1500,buy_price:4.18,sell_price:4.07,cost:6270,gross:-165,tax:-41.25,net:-123.75,pct:-2.63,month:"2025-05",hold_days:0,notes:""},
  {id:26,symbol:"OSCR",buy_date:"03/06/2025",sell_date:"06/06/2025",qty:800,buy_price:14.5,sell_price:15.5,cost:11600,gross:800,tax:200,net:600,pct:6.9,month:"2025-06",hold_days:3,notes:""},
  {id:27,symbol:"SOUN",buy_date:"04/06/2025",sell_date:"06/06/2025",qty:650,buy_price:10.08,sell_price:10.1,cost:6552,gross:13,tax:3.25,net:9.75,pct:0.2,month:"2025-06",hold_days:2,notes:""},
  {id:28,symbol:"NBIS",buy_date:"05/06/2025",sell_date:"06/06/2025",qty:155,buy_price:46.57,sell_price:47,cost:7218.35,gross:66.65,tax:16.66,net:49.99,pct:0.92,month:"2025-06",hold_days:1,notes:""},
  {id:29,symbol:"BULL",buy_date:"10/06/2025",sell_date:"11/06/2025",qty:500,buy_price:11.22,sell_price:10.93,cost:5610,gross:-145,tax:-36.25,net:-108.75,pct:-2.58,month:"2025-06",hold_days:1,notes:""},
  {id:30,symbol:"CEP",buy_date:"09/06/2025",sell_date:"30/06/2025",qty:300,buy_price:38,sell_price:27.39,cost:11400,gross:-3183,tax:-795.75,net:-2387.25,pct:-27.92,month:"2025-06",hold_days:21,notes:""},
  {id:31,symbol:"QBTS",buy_date:"01/07/2025",sell_date:"03/07/2025",qty:450,buy_price:15.13,sell_price:16.73,cost:6808.5,gross:720,tax:180,net:540,pct:10.58,month:"2025-07",hold_days:2,notes:""},
  {id:32,symbol:"SOUN",buy_date:"11/07/2025",sell_date:"31/07/2025",qty:700,buy_price:12,sell_price:13.01,cost:8400,gross:707,tax:176.75,net:530.25,pct:8.42,month:"2025-07",hold_days:20,notes:""},
  {id:33,symbol:"SOUN",buy_date:"11/07/2025",sell_date:"31/07/2025",qty:300,buy_price:12,sell_price:13.7,cost:3600,gross:510,tax:127.5,net:382.5,pct:14.17,month:"2025-07",hold_days:20,notes:""},
  {id:34,symbol:"SOUN",buy_date:"14/07/2025",sell_date:"31/07/2025",qty:400,buy_price:11.86,sell_price:13.7,cost:4744,gross:736,tax:184,net:552,pct:15.51,month:"2025-07",hold_days:17,notes:""},
  {id:35,symbol:"BMNR",buy_date:"21/07/2025",sell_date:"31/07/2025",qty:100,buy_price:43,sell_price:47,cost:4300,gross:400,tax:100,net:300,pct:9.3,month:"2025-07",hold_days:10,notes:""},
  {id:36,symbol:"RGTI",buy_date:"11/08/2025",sell_date:"31/08/2025",qty:400,buy_price:16,sell_price:20.5,cost:6400,gross:1800,tax:450,net:1350,pct:28.13,month:"2025-08",hold_days:20,notes:""},
  {id:37,symbol:"QBTS",buy_date:"11/08/2025",sell_date:"31/08/2025",qty:150,buy_price:17.6,sell_price:25.25,cost:2640,gross:1147.5,tax:286.88,net:860.62,pct:43.47,month:"2025-08",hold_days:20,notes:""},
  {id:38,symbol:"QBTS",buy_date:"11/08/2025",sell_date:"31/08/2025",qty:150,buy_price:17.6,sell_price:25.4,cost:2640,gross:1170,tax:292.5,net:877.5,pct:44.32,month:"2025-08",hold_days:20,notes:""},
  {id:39,symbol:"QUBT",buy_date:"11/08/2025",sell_date:"31/08/2025",qty:300,buy_price:16.5,sell_price:23,cost:4950,gross:1950,tax:487.5,net:1462.5,pct:39.39,month:"2025-08",hold_days:20,notes:""},
  {id:40,symbol:"QUBT",buy_date:"14/08/2025",sell_date:"31/08/2025",qty:180,buy_price:15.3,sell_price:23,cost:2754,gross:1386,tax:346.5,net:1039.5,pct:50.33,month:"2025-08",hold_days:17,notes:""},
  {id:41,symbol:"LAC",buy_date:"25/09/2025",sell_date:"25/09/2025",qty:900,buy_price:6.9,sell_price:7.2,cost:6210,gross:270,tax:67.5,net:202.5,pct:4.35,month:"2025-09",hold_days:0,notes:""},
  {id:42,symbol:"LAC",buy_date:"25/09/2025",sell_date:"25/09/2025",qty:900,buy_price:6.9,sell_price:7.4,cost:6210,gross:450,tax:112.5,net:337.5,pct:7.25,month:"2025-09",hold_days:0,notes:""},
  {id:43,symbol:"QUBT",buy_date:"03/10/2025",sell_date:"03/10/2025",qty:700,buy_price:21.4,sell_price:24,cost:14980,gross:1820,tax:455,net:1365,pct:12.15,month:"2025-10",hold_days:0,notes:""},
  {id:44,symbol:"AMD",buy_date:"06/10/2025",sell_date:"06/10/2025",qty:86,buy_price:208,sell_price:210.02,cost:17888,gross:173.72,tax:43.43,net:130.29,pct:0.97,month:"2025-10",hold_days:0,notes:""},
  {id:45,symbol:"QUBT",buy_date:"07/10/2025",sell_date:"07/10/2025",qty:860,buy_price:21.4,sell_price:21.88,cost:18404,gross:412.8,tax:103.2,net:309.6,pct:2.24,month:"2025-10",hold_days:0,notes:""},
  {id:46,symbol:"QBTS",buy_date:"08/10/2025",sell_date:"13/10/2025",qty:540,buy_price:36.4,sell_price:36.4,cost:19656,gross:0,tax:0,net:0,pct:0,month:"2025-10",hold_days:5,notes:""},
  {id:47,symbol:"RR",buy_date:"14/10/2025",sell_date:"14/10/2025",qty:2000,buy_price:6.8,sell_price:6.85,cost:13600,gross:100,tax:25,net:75,pct:0.74,month:"2025-10",hold_days:0,notes:""},
  {id:48,symbol:"RR",buy_date:"14/10/2025",sell_date:"14/10/2025",qty:2000,buy_price:6.65,sell_price:6.75,cost:13300,gross:200,tax:50,net:150,pct:1.5,month:"2025-10",hold_days:0,notes:""},
  {id:49,symbol:"RR",buy_date:"15/10/2025",sell_date:"30/10/2025",qty:1500,buy_price:6.19,sell_price:4.87,cost:9285,gross:-1980,tax:-495,net:-1485,pct:-21.32,month:"2025-10",hold_days:15,notes:""},
  {id:50,symbol:"RR",buy_date:"15/10/2025",sell_date:"30/10/2025",qty:840,buy_price:6.78,sell_price:4.87,cost:5695.2,gross:-1604.4,tax:-401.1,net:-1203.3,pct:-28.17,month:"2025-10",hold_days:15,notes:""},
  {id:51,symbol:"RR",buy_date:"15/10/2025",sell_date:"30/10/2025",qty:1660,buy_price:6.78,sell_price:4.23,cost:11254.8,gross:-4233,tax:-1058.25,net:-3174.75,pct:-37.61,month:"2025-10",hold_days:15,notes:""},
  {id:52,symbol:"RR",buy_date:"22/10/2025",sell_date:"30/10/2025",qty:680,buy_price:5.05,sell_price:4.23,cost:3434,gross:-557.6,tax:-139.4,net:-418.2,pct:-16.24,month:"2025-10",hold_days:8,notes:""},
  {id:53,symbol:"BULL",buy_date:"10/10/2025",sell_date:"30/10/2025",qty:800,buy_price:12.89,sell_price:9.92,cost:10312,gross:-2376,tax:-594,net:-1782,pct:-23.04,month:"2025-10",hold_days:20,notes:""},
  {id:54,symbol:"ONDS",buy_date:"01/11/2025",sell_date:"17/11/2025",qty:2290,buy_price:6.39,sell_price:7.78,cost:14633.1,gross:3183.1,tax:795.78,net:2387.32,pct:21.75,month:"2025-11",hold_days:16,notes:""},
  {id:55,symbol:"ONDS",buy_date:"20/11/2025",sell_date:"24/11/2025",qty:2200,buy_price:6.44,sell_price:8.5,cost:14168,gross:4532,tax:1133,net:3399,pct:31.99,month:"2025-11",hold_days:4,notes:""},
  {id:56,symbol:"ONDS",buy_date:"01/12/2025",sell_date:"08/12/2025",qty:1480,buy_price:6.47,sell_price:9.55,cost:9575.6,gross:4558.4,tax:1139.6,net:3418.8,pct:47.6,month:"2025-12",hold_days:7,notes:""},
  {id:57,symbol:"ONDS",buy_date:"16/12/2025",sell_date:"22/12/2025",qty:1500,buy_price:7.12,sell_price:9.5,cost:10680,gross:3570,tax:892.5,net:2677.5,pct:33.43,month:"2025-12",hold_days:6,notes:""},
  {id:58,symbol:"ONDS",buy_date:"16/12/2025",sell_date:"23/12/2025",qty:750,buy_price:7.12,sell_price:9.12,cost:5340,gross:1500,tax:375,net:1125,pct:28.09,month:"2025-12",hold_days:7,notes:""},
  {id:59,symbol:"ONDS",buy_date:"16/12/2025",sell_date:"24/12/2025",qty:750,buy_price:7.12,sell_price:9,cost:5340,gross:1410,tax:352.5,net:1057.5,pct:26.4,month:"2025-12",hold_days:8,notes:""},
  {id:60,symbol:"OKLO",buy_date:"18/12/2025",sell_date:"31/12/2025",qty:180,buy_price:85,sell_price:71.76,cost:15300,gross:-2383.2,tax:-595.8,net:-1787.4,pct:-15.58,month:"2025-12",hold_days:13,notes:""},
  {id:61,symbol:"OKLO",buy_date:"18/12/2025",sell_date:"31/12/2025",qty:50,buy_price:77.8,sell_price:71.76,cost:3890,gross:-302,tax:-75.5,net:-226.5,pct:-7.76,month:"2025-12",hold_days:13,notes:""},
  {id:62,symbol:"OKLO",buy_date:"02/01/2026",sell_date:"07/01/2026",qty:105,buy_price:71.73,sell_price:90,cost:7531.65,gross:1918.35,tax:479.59,net:1438.76,pct:25.47,month:"2026-01",hold_days:5,notes:""},
  {id:63,symbol:"OKLO",buy_date:"02/01/2026",sell_date:"07/01/2026",qty:105,buy_price:71.73,sell_price:90,cost:7531.65,gross:1918.35,tax:479.59,net:1438.76,pct:25.47,month:"2026-01",hold_days:5,notes:""},
  {id:64,symbol:"ONDS",buy_date:"08/01/2026",sell_date:"08/01/2026",qty:1800,buy_price:13.98,sell_price:14.5,cost:25164,gross:936,tax:234,net:702,pct:3.72,month:"2026-01",hold_days:0,notes:""},
  {id:65,symbol:"ONDS",buy_date:"22/01/2026",sell_date:"23/01/2026",qty:800,buy_price:13,sell_price:13,cost:10400,gross:0,tax:0,net:0,pct:0,month:"2026-01",hold_days:1,notes:""},
  {id:66,symbol:"QBTS",buy_date:"02/01/2026",sell_date:"23/01/2026",qty:555,buy_price:26.83,sell_price:27.28,cost:14890.65,gross:249.75,tax:62.44,net:187.31,pct:1.68,month:"2026-01",hold_days:21,notes:""},
  {id:67,symbol:"OKLO",buy_date:"22/01/2026",sell_date:"23/01/2026",qty:100,buy_price:94.54,sell_price:91.39,cost:9454,gross:-315,tax:-78.75,net:-236.25,pct:-3.33,month:"2026-01",hold_days:1,notes:""},
  {id:68,symbol:"QBTX",buy_date:"26/01/2026",sell_date:"27/01/2026",qty:800,buy_price:26.64,sell_price:28,cost:21312,gross:1088,tax:272,net:816,pct:5.11,month:"2026-01",hold_days:1,notes:""},
  {id:69,symbol:"QBTX",buy_date:"26/01/2026",sell_date:"27/01/2026",qty:800,buy_price:24,sell_price:24.59,cost:19200,gross:472,tax:118,net:354,pct:2.46,month:"2026-01",hold_days:1,notes:""},
  {id:70,symbol:"QBTX",buy_date:"26/01/2026",sell_date:"27/01/2026",qty:500,buy_price:23.02,sell_price:24.59,cost:11510,gross:785,tax:196.25,net:588.75,pct:6.82,month:"2026-01",hold_days:1,notes:""},
  {id:71,symbol:"ONDL",buy_date:"02/02/2026",sell_date:"03/02/2026",qty:555,buy_price:27.75,sell_price:29.75,cost:15401.25,gross:1110,tax:277.5,net:832.5,pct:7.21,month:"2026-02",hold_days:1,notes:""},
  {id:72,symbol:"QBTX",buy_date:"02/02/2026",sell_date:"04/02/2026",qty:800,buy_price:19.87,sell_price:20.4,cost:15896,gross:424,tax:106,net:318,pct:2.67,month:"2026-02",hold_days:2,notes:""},
  {id:73,symbol:"QBTX",buy_date:"04/02/2026",sell_date:"04/02/2026",qty:500,buy_price:19,sell_price:20.4,cost:9500,gross:700,tax:175,net:525,pct:7.37,month:"2026-02",hold_days:0,notes:""},
  {id:74,symbol:"ONDL",buy_date:"03/02/2026",sell_date:"18/02/2026",qty:500,buy_price:21,sell_price:26,cost:10500,gross:2500,tax:625,net:1875,pct:23.81,month:"2026-02",hold_days:15,notes:""},
  {id:75,symbol:"ONDL",buy_date:"03/02/2026",sell_date:"18/02/2026",qty:500,buy_price:21,sell_price:26,cost:10500,gross:2500,tax:625,net:1875,pct:23.81,month:"2026-02",hold_days:15,notes:""},
  {id:76,symbol:"ONDL",buy_date:"03/02/2026",sell_date:"18/02/2026",qty:555,buy_price:28,sell_price:26,cost:15540,gross:-1110,tax:-277.5,net:-832.5,pct:-7.14,month:"2026-02",hold_days:15,notes:""},
  {id:77,symbol:"ONDL",buy_date:"03/02/2026",sell_date:"19/02/2026",qty:555,buy_price:26,sell_price:27.85,cost:14430,gross:1026.75,tax:256.69,net:770.06,pct:7.12,month:"2026-02",hold_days:16,notes:""},
  {id:78,symbol:"ONDL",buy_date:"24/02/2026",sell_date:"25/02/2026",qty:1200,buy_price:23.5,sell_price:24,cost:28200,gross:600,tax:150,net:450,pct:2.13,month:"2026-02",hold_days:1,notes:""},
  {id:79,symbol:"ONDL",buy_date:"24/02/2026",sell_date:"25/02/2026",qty:300,buy_price:23.5,sell_price:22.19,cost:7050,gross:-393,tax:-98.25,net:-294.75,pct:-5.57,month:"2026-02",hold_days:1,notes:""},
  {id:80,symbol:"ONDL",buy_date:"24/02/2026",sell_date:"25/02/2026",qty:1200,buy_price:23,sell_price:22.19,cost:27600,gross:-972,tax:-243,net:-729,pct:-3.52,month:"2026-02",hold_days:1,notes:""},
  {id:81,symbol:"ONDL",buy_date:"04/03/2026",sell_date:"16/03/2026",qty:540,buy_price:23.86,sell_price:22.5,cost:12884.4,gross:-734.4,tax:-183.6,net:-550.8,pct:-5.7,month:"2026-03",hold_days:12,notes:""},
  {id:82,symbol:"ONDL",buy_date:"04/03/2026",sell_date:"17/03/2026",qty:410,buy_price:23.86,sell_price:24,cost:9782.6,gross:57.4,tax:14.35,net:43.05,pct:0.59,month:"2026-03",hold_days:13,notes:""},
  {id:83,symbol:"ONDL",buy_date:"04/03/2026",sell_date:"17/03/2026",qty:120,buy_price:20.83,sell_price:24,cost:2499.6,gross:380.4,tax:95.1,net:285.3,pct:15.22,month:"2026-03",hold_days:13,notes:""},
  {id:84,symbol:"ONDL",buy_date:"09/03/2026",sell_date:"17/03/2026",qty:540,buy_price:20,sell_price:24,cost:10800,gross:2160,tax:540,net:1620,pct:20,month:"2026-03",hold_days:8,notes:""},
  {id:85,symbol:"ONDL",buy_date:"18/03/2026",sell_date:"18/03/2026",qty:500,buy_price:25,sell_price:25.5,cost:12500,gross:250,tax:62.5,net:187.5,pct:2,month:"2026-03",hold_days:0,notes:""},
  {id:86,symbol:"ONDL",buy_date:"18/03/2026",sell_date:"18/03/2026",qty:55,buy_price:25.5,sell_price:25.5,cost:1402.5,gross:0,tax:0,net:0,pct:0,month:"2026-03",hold_days:0,notes:""},
  {id:87,symbol:"QBTX",buy_date:"27/02/2026",sell_date:"15/04/2026",qty:1500,buy_price:17,sell_price:15.33,cost:25500,gross:-2505,tax:-626.25,net:-1878.75,pct:-9.82,month:"2026-04",hold_days:47,notes:""},
  {id:88,symbol:"QBTX",buy_date:"27/02/2026",sell_date:"22/04/2026",qty:500,buy_price:17,sell_price:16,cost:8500,gross:-500,tax:-125,net:-375,pct:-5.88,month:"2026-04",hold_days:54,notes:""},
  {id:89,symbol:"QBTX",buy_date:"05/03/2026",sell_date:"22/04/2026",qty:250,buy_price:12,sell_price:16,cost:3000,gross:1000,tax:250,net:750,pct:33.33,month:"2026-04",hold_days:48,notes:""},
  {id:90,symbol:"QBTX",buy_date:"05/03/2026",sell_date:"04/05/2026",qty:750,buy_price:12,sell_price:15.01,cost:9000,gross:2257.5,tax:564.38,net:1693.12,pct:25.08,month:"2026-05",hold_days:60,notes:""},
  {id:91,symbol:"QBTX",buy_date:"01/05/2026",sell_date:"04/05/2026",qty:1,buy_price:12.51,sell_price:15.01,cost:12.51,gross:2.5,tax:0.63,net:1.87,pct:19.98,month:"2026-05",hold_days:3,notes:""},
  {id:92,symbol:"ONDL",buy_date:"18/03/2026",sell_date:"04/05/2026",qty:500,buy_price:25.5,sell_price:16.5,cost:12750,gross:-4500,tax:-1125,net:-3375,pct:-35.29,month:"2026-05",hold_days:47,notes:""},
  {id:93,symbol:"ONDL",buy_date:"18/03/2026",sell_date:"04/05/2026",qty:500,buy_price:24,sell_price:16.5,cost:12000,gross:-3750,tax:-937.5,net:-2812.5,pct:-31.25,month:"2026-05",hold_days:47,notes:""},
  {id:94,symbol:"ONDL",buy_date:"18/03/2026",sell_date:"14/05/2026",qty:500,buy_price:24,sell_price:17.5,cost:12000,gross:-3250,tax:-812.5,net:-2437.5,pct:-27.08,month:"2026-05",hold_days:57,notes:""},
  {id:95,symbol:"ONDL",buy_date:"29/04/2026",sell_date:"14/05/2026",qty:1500,buy_price:15.5,sell_price:17.5,cost:23250,gross:3000,tax:750,net:2250,pct:12.9,month:"2026-05",hold_days:15,notes:""},
  {id:96,symbol:"ONDL",buy_date:"07/05/2026",sell_date:"14/05/2026",qty:1000,buy_price:13.5,sell_price:17.5,cost:13500,gross:4000,tax:1000,net:3000,pct:29.63,month:"2026-05",hold_days:7,notes:""},
  {id:97,symbol:"ONDL",buy_date:"12/05/2026",sell_date:"14/05/2026",qty:900,buy_price:13.5,sell_price:17.5,cost:12150,gross:3600,tax:900,net:2700,pct:29.63,month:"2026-05",hold_days:2,notes:""},
  {id:98,symbol:"ONDL",buy_date:"21/05/2026",sell_date:"27/05/2026",qty:1500,buy_price:13.48,sell_price:16,cost:20220,gross:3780,tax:945,net:2835,pct:18.69,month:"2026-05",hold_days:6,notes:""},
  {id:99,symbol:"RCAX",buy_date:"05/05/2026",sell_date:"28/05/2026",qty:2000,buy_price:7.5,sell_price:11,cost:15000,gross:7000,tax:1750,net:5250,pct:46.67,month:"2026-05",hold_days:23,notes:""},
  {id:100,symbol:"RCAX",buy_date:"14/05/2026",sell_date:"28/05/2026",qty:2500,buy_price:6.5,sell_price:11,cost:16250,gross:11250,tax:2812.5,net:8437.5,pct:69.23,month:"2026-05",hold_days:14,notes:""},
  {id:101,symbol:"RCAX",buy_date:"14/05/2026",sell_date:"28/05/2026",qty:1500,buy_price:6.5,sell_price:11,cost:9750,gross:6750,tax:1687.5,net:5062.5,pct:69.23,month:"2026-05",hold_days:14,notes:""},
  {id:102,symbol:"RCAX",buy_date:"19/05/2026",sell_date:"28/05/2026",qty:2000,buy_price:5.5,sell_price:11,cost:11000,gross:11000,tax:2750,net:8250,pct:100,month:"2026-05",hold_days:9,notes:""},
  {id:103,symbol:"QBTZ",buy_date:"02/06/2026",sell_date:"02/06/2026",qty:10000,buy_price:3.09,sell_price:3.35,cost:30900,gross:2600,tax:650,net:1950,pct:8.41,month:"2026-06",hold_days:0,notes:""},
  {id:104,symbol:"QBTZ",buy_date:"02/06/2026",sell_date:"03/06/2026",qty:5000,buy_price:3.4,sell_price:3.8,cost:17000,gross:2000,tax:500,net:1500,pct:11.76,month:"2026-06",hold_days:1,notes:""},
  {id:105,symbol:"QBTZ",buy_date:"02/06/2026",sell_date:"03/06/2026",qty:5000,buy_price:3.3,sell_price:3.8,cost:16500,gross:2500,tax:625,net:1875,pct:15.15,month:"2026-06",hold_days:1,notes:""},
  {id:106,symbol:"RCAX",buy_date:"04/06/2026",sell_date:"04/06/2026",qty:2500,buy_price:12.25,sell_price:12.39,cost:30625,gross:350,tax:87.5,net:262.5,pct:1.14,month:"2026-06",hold_days:0,notes:""},
  {id:107,symbol:"QBTZ",buy_date:"04/06/2026",sell_date:"04/06/2026",qty:5555,buy_price:3.5,sell_price:3.79,cost:19442.5,gross:1610.95,tax:402.74,net:1208.21,pct:8.29,month:"2026-06",hold_days:0,notes:""},
  {id:108,symbol:"OKLL",buy_date:"11/06/2026",sell_date:"11/06/2026",qty:4800,buy_price:5.7,sell_price:6,cost:27360,gross:1440,tax:360,net:1080,pct:5.26,month:"2026-06",hold_days:0,notes:""}
];

// ── Global Application State ────────────────────────────────
window.APP = {
  trades:     [],
  positions:  [],
  watchlist:  [],
  liveData:   {},
  monthGoal:  5000,
  darkMode:   false,
  sortCol:    'sell_date',
  sortDir:    -1,
  charts:     {},       // Chart.js instances
  statsCache: null,     // invalidated when trades change
  editId:     null,
  posEditId:  null,
  journalId:  null,
  noteId:     null,
  pollingInterval: null,
};

// ── Stats cache helpers ─────────────────────────────────────
function getStats() {
  if (!APP.statsCache) APP.statsCache = Utils.calcStats(APP.trades);
  return APP.statsCache;
}
function invalidateStats() { APP.statsCache = null; }

// ── Dark Mode ───────────────────────────────────────────────
function toggleDark() {
  APP.darkMode = !APP.darkMode;
  document.body.classList.toggle('light', !APP.darkMode);
  const btn = document.getElementById('dark-btn');
  if (btn) btn.textContent = APP.darkMode ? '☀️ Light' : '🌙 Dark';
  Utils.LS.set('fifo_dark', APP.darkMode ? '1' : '0');
}

// ── Clear in-memory private state ──────────────────────────
function clearAppState() {
  APP.trades     = [];
  APP.positions  = [];
  APP.watchlist  = [];
  APP.liveData   = {};
  APP.statsCache = null;
  APP.monthGoal  = 5000;
}

// ── Load data ───────────────────────────────────────────────
// Returns true on success, false on any failure (including 401).
// When API is configured, NEVER falls back to SEED or localStorage.
async function load() {
  // Start from a clean slate so no previous session data leaks through
  clearAppState();

  if (!API.isConfigured()) {
    // Dev / offline mode: load SEED data so the UI is usable without a backend
    APP.trades = JSON.parse(JSON.stringify(SEED)).map(Utils.normalizeTrade);
    invalidateStats();
    updateSeedBanner();
    return true;
  }

  const data = await API.loadAll();

  // loadAll() returns null on any error, including 401.
  // On 401, api.js already called Auth.handle401() which shows the login screen.
  // Either way: leave APP empty — never render stale data.
  if (!data) return false;

  APP.trades = (data.trades || []).map(Utils.normalizeTrade);
  if (data.goal !== null && data.goal !== undefined) APP.monthGoal = data.goal;

  if (data.positions) {
    APP.positions = data.positions.map(p => {
      ['id','qty','avg_price','target','stop_loss'].forEach(k => {
        if (p[k] !== '' && p[k] !== undefined) p[k] = parseFloat(p[k]) || 0;
      });
      return p;
    });
  }

  if (data.watchlist) {
    APP.watchlist = normalizeWatchlistRows(data.watchlist);
  }

  invalidateStats();
  updateSeedBanner();
  API.setStatus('✓ עודכן: ' + new Date().toLocaleTimeString('he-IL'), 'ok');
  const el = document.getElementById('last-updated');
  if (el) el.textContent = 'עודכן: ' + new Date().toLocaleTimeString('he-IL');
  return true;
}

// ── Watchlist normalize ─────────────────────────────────────
function normalizeWatchlistRows(rows) {
  return (rows || []).map(w => ({
    symbol: String(w.symbol || '').trim().toUpperCase(),
    note:   w.note   || '',
    added:  w.added  || ''
  })).filter(w => w.symbol);
}

// ── Seed banner ─────────────────────────────────────────────
async function seedToSheets() {
  API.setStatus('בודק נתונים קיימים...', 'info');
  API.showSpinner(true);
  try {
    // Use the authenticated loadAll so the token is included
    const existing = await API.loadAll();
    if (existing && existing.trades && existing.trades.length > 0) {
      API.setStatus('ℹ️ כבר קיימות ' + existing.trades.length + ' עסקאות', 'ok');
      APP.trades = existing.trades.map(Utils.normalizeTrade);
      updateSeedBanner();
      renderAll();
      API.showSpinner(false);
      return;
    }
  } catch {}
  if (!confirm('לטעון 108 עסקאות היסטוריות?')) { API.showSpinner(false); return; }
  API.setStatus('מעלה נתונים...', 'info');
  const res = await API.seedAll(SEED);
  if (res.ok) {
    API.setStatus('✓ ' + res.count + ' עסקאות הועלו', 'ok');
    document.getElementById('seed-banner').style.display = 'none';
    await load(); renderAll();
  } else {
    API.setStatus('❌ ' + res.error, 'error');
  }
  API.showSpinner(false);
}

// ── Render all tabs ─────────────────────────────────────────
function renderAll() {
  const st = getStats();
  Dashboard.render(st);
  Charts.renderEquity(st);
  Charts.renderMonthly(st);
  Charts.renderDrawdown(st);
  Trades.render();
  Trades.updateFilters();
  Journal.render();
  Positions.render();
  AICoach.render();
}

// ── Category tracking ───────────────────────────────────────
APP.currentCategory = 'dashboard';
APP.lastTab = {
  dashboard: 'hub-dashboard',
  trading:   'hub-trading',
  analysis:  'hub-analysis',
  ai:        'hub-ai',
  settings:  'hub-settings'
};

// Category display names for breadcrumb
const CAT_LABELS = {
  dashboard: 'דשבורד', trading: 'מסחר', analysis: 'ניתוח',
  ai: 'בינה מלאכותית', settings: 'הגדרות'
};
const TAB_LABELS = {
  dashboard:'דשבורד ראשי', brief:'סיכום יומי', goals:'יעדים',
  progress:'התקדמות', ptimeline:'ציר זמן', grade:'ציון מסחר',
  positions:'פוזיציות', trades:'עסקאות', quicktrade:'כניסה מהירה',
  watchlist:'רשימת מעקב', journal:'יומן',
  analysis:'ניתוח גרפי', performance:'ביצועים', insights:'תובנות',
  replay:'Trade Replay', portheatmap:'Heatmap תיק',
  heatmap:'לוח שנה', symnotes:'לפי סימבול',
  decision:'מנוע החלטות', coach:'מאמן AI', aichat:'שיחה עם AI',
  settings:'הגדרות מערכת'
};

// ── Category switching ──────────────────────────────────────
function switchCategory(cat, btn, fromBottomNav) {
  APP.currentCategory = cat;
  document.querySelectorAll('.nav-cat').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.bn-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll(`.nav-cat[data-cat="${cat}"]`).forEach(b => b.classList.add('active'));
  document.querySelectorAll(`.bn-item[data-cat="${cat}"]`).forEach(b => b.classList.add('active'));
  // Show the hub panel for this category
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const hub = document.getElementById('tab-hub-' + cat);
  if (hub) hub.classList.add('active');
  _hideBreadcrumb();
  // Reset lastTab so next time we enter the category, we always land on hub first
  APP.lastTab[cat] = 'hub-' + cat;
}

// ── Breadcrumb helpers ──────────────────────────────────────
function _showBreadcrumb(tabName) {
  const bc    = document.getElementById('breadcrumb');
  const catEl = document.getElementById('breadcrumb-cat-label');
  const tabEl = document.getElementById('breadcrumb-tab-label');
  if (!bc) return;
  if (catEl) catEl.textContent = CAT_LABELS[APP.currentCategory] || APP.currentCategory;
  if (tabEl) tabEl.textContent = TAB_LABELS[tabName] || tabName;
  bc.style.display = 'flex';
}
function _hideBreadcrumb() {
  const bc = document.getElementById('breadcrumb');
  if (bc) bc.style.display = 'none';
}

// ── Tab switching ───────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  if (btn) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
  }
  const panel = document.getElementById('tab-' + name);
  if (panel) panel.classList.add('active');
  APP.lastTab[APP.currentCategory] = name;
  _showBreadcrumb(name);

  const st = getStats();
  switch (name) {
    case 'positions':
      if (APP.positions.length > 0 && Object.keys(APP.liveData).length === 0)
        Positions.refreshPrices();
      Positions.connectWS();
      break;
    case 'watchlist':
      Watchlist.render();
      if (APP.watchlist.length > 0) Watchlist.refresh();
      break;
    case 'decision':
      DecisionEngine.renderStarter();
      break;
    case 'coach':
      AICoach.render();
      break;
    case 'aichat':
      AIChat.init();
      break;
    case 'quicktrade':
      QuickTrade.reset();
      break;
    case 'progress':
      Analytics.renderProgress(st);
      break;
    case 'heatmap':
      Analytics.renderHeatmap(st);
      break;
    case 'insights':
      Analytics.renderInsights(st);
      break;
    case 'symnotes':
      Analytics.renderSymNotes();
      break;
    case 'analysis':
      Charts.renderSymbol(st);
      break;
    case 'performance':
      Analytics.renderPerformance(st);
      break;
    case 'goals':
      Dashboard.renderGoalsTab(st);
      renderSmartGoals(st);
      break;
    case 'brief':
      renderDailyBrief();
      break;
    case 'replay':
      if (typeof TradeReplay !== 'undefined') TradeReplay.render();
      break;
    case 'grade':
      if (typeof DailyGrade !== 'undefined') DailyGrade.render();
      break;
    case 'ptimeline':
      if (typeof PerformanceTimeline !== 'undefined') PerformanceTimeline.render();
      break;
    case 'portheatmap':
      renderPortfolioHeatmap();
      break;
    case 'settings':
      if (typeof Settings !== 'undefined') Settings.render();
      break;
  }
}

// ── Polling fallback ────────────────────────────────────────
function startPolling() {
  if (APP.pollingInterval) return;
  APP.pollingInterval = setInterval(() => {
    if (APP.positions.length > 0) Positions.refreshPrices();
  }, 15000);
}

// ── Export CSV ──────────────────────────────────────────────
function exportCSV() {
  const { parseDD } = Utils;
  const headers = ['סימבול','תאריך קנייה','תאריך מכירה','כמות','מחיר קנייה','מחיר מכירה',
    'עלות $','ברוטו $','מס $','נטו $','%','חודש','ימי החזקה','הערות',
    'סיבת כניסה','סיבת יציאה','כיבד סטופ','לפי תוכנית','לקח','מצב רגשי'];
  const fields = ['symbol','buy_date','sell_date','qty','buy_price','sell_price',
    'cost','gross','tax','net','pct','month','hold_days','notes',
    'entry_reason','exit_reason','respected_stop','followed_plan','lesson','emotion'];
  const rows = [headers.join(',')];
  [...APP.trades].sort((a,b) => parseDD(a.sell_date) - parseDD(b.sell_date)).forEach(t => {
    rows.push(fields.map(f => {
      const v = t[f] ?? '';
      return typeof v === 'string' && v.includes(',') ? `"${v}"` : v;
    }).join(','));
  });
  const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `FIFO_PRO_${new Date().toLocaleDateString('en-GB').replace(/\//g,'-')}.csv`;
  a.click();
}

// ── Daily Brief ─────────────────────────────────────────────
function renderDailyBrief() {
  const el = document.getElementById('brief-content');
  if (!el) return;

  const st  = getStats();
  const now = new Date();
  const days = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
  const months = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
  const dateStr = `יום ${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;

  const curM = Utils.currentMonthKey();
  const monthTrades = APP.trades.filter(t => t.month === curM);
  const monthNet    = monthTrades.reduce((s,t) => s+t.net, 0);
  const goalPct     = APP.monthGoal > 0 ? Math.min(120, Math.round(monthNet / APP.monthGoal * 100)) : 0;
  const openPnl     = APP.positions.reduce((s,p) => {
    const live = APP.liveData[p.symbol];
    return s + (live?.price ? (live.price - p.avg_price) * p.qty : 0);
  }, 0);

  // What changed since last visit
  const lastVisit = Auth.getLastVisit();
  const newTrades = lastVisit ? APP.trades.filter(t => {
    const d = Utils.parseDD(t.sell_date);
    return d.getTime() > lastVisit.ts;
  }).length : 0;

  // Risks for today
  const risks = [];
  APP.positions.forEach(p => {
    const live = APP.liveData[p.symbol];
    if (live && live.price) {
      const pnlPct = ((live.price - p.avg_price) / p.avg_price) * 100;
      if (pnlPct < -8) risks.push(`${p.symbol}: ירד ${pnlPct.toFixed(1)}% מהכניסה`);
      if (p.stop_loss && live.price < p.stop_loss * 1.02)
        risks.push(`${p.symbol}: קרוב לסטופ ($${p.stop_loss})`);
    }
  });

  // AI coach sentence based on performance
  let coachMsg = '';
  if (st.winRate >= 65 && st.totalNet > 0)
    coachMsg = 'ביצועים מצוינים! שמור על המשמעת והמשך לפי התוכנית.';
  else if (st.winRate < 50)
    coachMsg = 'Win Rate מתחת ל-50%. שקול לצמצם גודל פוזיציות עד לשיפור הדיוק.';
  else if (monthNet < 0)
    coachMsg = 'חודש מאתגר. זה זמן טוב לעיין ביומן ולזהות תבניות.';
  else
    coachMsg = 'בקצב טוב. זכור: עקביות עדיפה על ניסיון לתפוס עסקה גדולה.';

  el.innerHTML = `
    <div class="brief-hero">
      <div class="brief-greeting">שלום, בוקר טוב 👋</div>
      <div class="brief-date">${dateStr}</div>

      <div class="brief-kpis">
        <div class="brief-kpi">
          <div class="brief-kpi-label">P&L פתוח</div>
          <div class="brief-kpi-val ${openPnl >= 0 ? 'green' : 'red'}">${Utils.f$(Math.round(openPnl))}</div>
        </div>
        <div class="brief-kpi">
          <div class="brief-kpi-label">רווח החודש</div>
          <div class="brief-kpi-val ${monthNet >= 0 ? 'green' : 'red'}">${Utils.f$(Math.round(monthNet))}</div>
        </div>
        <div class="brief-kpi">
          <div class="brief-kpi-label">יעד חודשי</div>
          <div class="brief-kpi-val">${goalPct}% (${Utils.f$(APP.monthGoal)})</div>
        </div>
        <div class="brief-kpi">
          <div class="brief-kpi-label">פוזיציות פתוחות</div>
          <div class="brief-kpi-val">${APP.positions.length}</div>
        </div>
        <div class="brief-kpi">
          <div class="brief-kpi-label">עסקאות החודש</div>
          <div class="brief-kpi-val">${monthTrades.length}</div>
        </div>
        <div class="brief-kpi">
          <div class="brief-kpi-label">Win Rate כולל</div>
          <div class="brief-kpi-val ${st.winRate >= 55 ? 'green' : 'red'}">${st.winRate}%</div>
        </div>
      </div>

      <div class="brief-coach">
        <span class="brief-coach-icon">🤖</span>
        <strong>AI Coach:</strong> ${coachMsg}
      </div>

      ${newTrades > 0 ? `
        <div class="brief-changes">
          <div class="brief-change-item">📊 ${newTrades} עסקאות חדשות מהכניסה האחרונה</div>
        </div>
      ` : ''}

      ${risks.length ? `
        <div class="brief-risk">
          <strong style="color:var(--red)">⚠️ סיכוני היום:</strong>
          <ul style="margin-top:6px;padding-right:16px;font-size:12px">
            ${risks.map(r => `<li>${r}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </div>

    ${APP.watchlist.length ? `
      <div class="card">
        <div class="card-title">👁 Watchlist — כדאי לשים לב</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${APP.watchlist.slice(0,8).map(w => {
            const live = APP.liveData[w.symbol];
            const price = live?.price;
            const chgPct = live?.changePctValid ? live.changePct : null;
            return `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-md);padding:8px 12px;font-size:13px">
              <strong>${w.symbol}</strong>
              ${price ? `<span style="margin-right:8px;color:var(--text-3)">$${price.toFixed(2)}</span>` : ''}
              ${chgPct != null ? `<span class="${chgPct >= 0 ? 'green' : 'red'}">${Utils.fpct(chgPct)}</span>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

// ── Smart Goals ──────────────────────────────────────────────
function renderSmartGoals(st) {
  const el = document.getElementById('goals-content');
  if (!el) return;

  const now       = new Date();
  const curM      = Utils.currentMonthKey();
  const monthTrades = APP.trades.filter(t => t.month === curM);
  const monthNet  = monthTrades.reduce((s,t) => s+t.net, 0);
  const goal      = APP.monthGoal || 5000;
  const pct       = goal > 0 ? Math.min(120, Math.max(0, (monthNet / goal) * 100)) : 0;
  const remaining = goal - monthNet;

  // Trading days remaining in month
  const lastDay   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysLeft  = Math.max(0, Math.ceil((lastDay - now) / 86400000));
  const tdLeft    = Math.max(1, Math.round(daysLeft * 5/7));

  // How much per trading day needed
  const perDay    = remaining > 0 && tdLeft > 0 ? remaining / tdLeft : 0;

  // Current avg per trade
  const avgTrade  = monthTrades.length > 0 ? monthNet / monthTrades.length : (st.avgNet || 0);

  // Simulation: at current average, where do we end?
  const totalTradingDays = Math.round(lastDay.getDate() * 5/7);
  const elapsedTD = totalTradingDays - tdLeft;
  const projectedEnd = elapsedTD > 0 && avgTrade
    ? monthNet + (avgTrade * (monthTrades.length / Math.max(1, elapsedTD)) * tdLeft)
    : monthNet;

  const isOnTrack  = monthNet >= goal * (1 - daysLeft / lastDay.getDate());
  const paceClass  = pct >= 100 ? 'ahead' : isOnTrack ? 'on-track' : 'behind';
  const paceText   = pct >= 100 ? '🎯 הגעת ליעד!' : isOnTrack ? '✓ בקצב טוב' : '⚡ מתחת לקצב';

  const strokeLen  = 2 * Math.PI * 80; // r=80
  const offset     = strokeLen - (Math.min(100, pct) / 100) * strokeLen;
  const ringColor  = pct >= 100 ? 'var(--green)' : pct >= 60 ? 'var(--blue)' : 'var(--gold)';

  el.innerHTML = `
    <div class="card">
      <div class="card-title">🎯 יעד חודשי — ${Utils.monthLabel(curM)}</div>

      <div class="goal-ring-wrap">
        <svg class="goal-ring-svg" viewBox="0 0 180 180">
          <circle cx="90" cy="90" r="80" fill="none" stroke="var(--surface-3)" stroke-width="12"/>
          <circle cx="90" cy="90" r="80" fill="none" stroke="${ringColor}" stroke-width="12"
            stroke-dasharray="${strokeLen}" stroke-dashoffset="${offset}"
            stroke-linecap="round" style="transition:stroke-dashoffset 0.8s ease"/>
        </svg>
        <div class="goal-ring-center">
          <div class="goal-ring-pct" style="color:${ringColor}">${Math.round(pct)}%</div>
          <div class="goal-ring-label">מהיעד</div>
        </div>
      </div>

      <div class="flex-between mb-12">
        <div style="font-size:13px;color:var(--text-3)">
          ${Utils.f$(Math.round(monthNet))} מתוך ${Utils.f$(goal)}
        </div>
        <div class="goal-pace ${paceClass}">${paceText}</div>
      </div>

      <div class="card" style="margin-bottom:0;background:var(--surface-2)">
        <div class="card-title">📊 סימולציה</div>
        <div class="goal-sim-row"><span class="goal-sim-label">ימי מסחר שנשארו</span><span class="goal-sim-val">${tdLeft}</span></div>
        <div class="goal-sim-row"><span class="goal-sim-label">נדרש ליום מסחר</span><span class="goal-sim-val ${remaining > 0 ? '' : 'green'}">${remaining > 0 ? Utils.f$(Math.round(perDay)) : 'הושג ✓'}</span></div>
        <div class="goal-sim-row"><span class="goal-sim-label">ממוצע לעסקה (החודש)</span><span class="goal-sim-val">${Utils.f$(Math.round(avgTrade))}</span></div>
        <div class="goal-sim-row"><span class="goal-sim-label">תחזית לסוף החודש</span><span class="goal-sim-val ${projectedEnd >= goal ? 'green' : 'red'}">${Utils.f$(Math.round(projectedEnd))}</span></div>
      </div>
    </div>
  `;
}

// ── Portfolio Heatmap ────────────────────────────────────────
function renderPortfolioHeatmap() {
  const el = document.getElementById('portheatmap-content');
  if (!el) return;

  if (!APP.trades.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🌡️</div><div class="empty-title">אין עסקאות</div></div>`;
    return;
  }

  // Aggregate by symbol
  const bySymbol = {};
  APP.trades.forEach(t => {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = { net:0, cost:0, trades:0 };
    bySymbol[t.symbol].net    += t.net;
    bySymbol[t.symbol].cost   += t.cost;
    bySymbol[t.symbol].trades += 1;
  });

  const syms = Object.entries(bySymbol).sort((a,b) => b[1].net - a[1].net);
  const maxAbs = Math.max(...syms.map(([,v]) => Math.abs(v.net)));
  const totalCost = syms.reduce((s,[,v]) => s + Math.abs(v.net), 0);

  el.innerHTML = `
    <div class="card">
      <div class="card-title">🌡️ Portfolio Heatmap — לפי סימבול</div>
      <div class="porthm-legend">
        <span><span class="porthm-legend-box" style="background:rgba(78,204,168,0.7)"></span>רווח</span>
        <span><span class="porthm-legend-box" style="background:rgba(255,107,107,0.7)"></span>הפסד</span>
        <span style="color:var(--text-3);font-size:11px">גודל התא = גודל הרווח/הפסד</span>
      </div>
      <div class="porthm-grid">
        ${syms.map(([sym, v]) => {
          const intensity = maxAbs > 0 ? Math.abs(v.net) / maxAbs : 0;
          const isPos = v.net >= 0;
          const alpha = 0.15 + intensity * 0.7;
          const bg    = isPos ? `rgba(78,204,168,${alpha})` : `rgba(255,107,107,${alpha})`;
          const textColor = intensity > 0.6 ? '#fff' : (isPos ? 'var(--green)' : 'var(--red)');
          const pct = totalCost > 0 ? ((Math.abs(v.net) / totalCost) * 100).toFixed(1) : '0';
          return `
            <div class="porthm-cell" style="background:${bg}" title="${sym}: ${Utils.f$(Math.round(v.net))} | ${v.trades} עסקאות">
              <div class="porthm-sym" style="color:${textColor}">${sym}</div>
              <div class="porthm-pct" style="color:${textColor}">${Utils.f$(Math.round(v.net))}</div>
              <div class="porthm-val" style="color:${textColor}">${v.trades} עסקאות</div>
              <div class="porthm-size" style="color:${textColor}">${pct}% מסה״כ</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-title">📊 תרומה לתיק — מיון לפי רווח/הפסד</div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>סימבול</th><th>נטו $</th><th>עסקאות</th><th>% מסה"כ</th><th>ממוצע לעסקה</th>
          </tr></thead>
          <tbody>
            ${syms.map(([sym, v]) => {
              const pct = totalCost > 0 ? ((Math.abs(v.net) / totalCost) * 100).toFixed(1) : '0';
              const avg = v.trades > 0 ? v.net / v.trades : 0;
              return `<tr>
                <td><strong>${sym}</strong></td>
                <td class="${v.net >= 0 ? 'green' : 'red'}">${Utils.f$(Math.round(v.net))}</td>
                <td>${v.trades}</td>
                <td>${pct}%</td>
                <td class="${avg >= 0 ? 'green' : 'red'}">${Utils.f$(Math.round(avg))}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ── Proactive AI Coach Warnings ──────────────────────────────
function checkProactiveCoach() {
  const alerts = [];
  const { trades } = APP;
  if (trades.length < 3) return;

  // Check last 10 trades for patterns
  const recent = trades.slice(-10);
  const recentLosses = recent.filter(t => t.net < 0);

  // Consecutive losses
  let streak = 0;
  for (let i = trades.length - 1; i >= 0; i--) {
    if (trades[i].net < 0) streak++;
    else break;
  }
  if (streak >= 3) alerts.push(`⛔ ${streak} הפסדים רצופים — שקול להפסיק לסחור היום`);

  // No stops in recent trades
  const noStops = recent.filter(t => t.respected_stop === 'לא').length;
  if (noStops >= 2) alerts.push(`⚠️ ${noStops} עסקאות אחרונות ללא כיבוד סטופ`);

  // High loss rate recently
  if (recent.length >= 5 && recentLosses.length / recent.length > 0.7)
    alerts.push(`📉 70%+ הפסדים ב-${recent.length} עסקאות אחרונות`);

  // Open positions near stop loss
  APP.positions.forEach(p => {
    const live = APP.liveData[p.symbol];
    if (live && p.stop_loss && live.price) {
      const distPct = ((live.price - p.stop_loss) / p.stop_loss) * 100;
      if (distPct < 3 && distPct >= 0)
        alerts.push(`🔴 ${p.symbol}: ${distPct.toFixed(1)}% מהסטופ — היה ערוך`);
    }
  });

  const alertEl  = document.getElementById('coach-alert');
  const itemsEl  = document.getElementById('coach-alert-items');
  if (!alertEl || !itemsEl) return;
  if (alerts.length) {
    itemsEl.innerHTML = alerts.map(a => `<div class="coach-alert-item">${a}</div>`).join('');
    alertEl.style.display = 'block';
  } else {
    alertEl.style.display = 'none';
  }
}

// ── Seed banner — hide when trades exist ─────────────────────
function updateSeedBanner() {
  const b = document.getElementById('seed-banner');
  if (!b) return;
  // Hide if trades already exist — no need to show upload prompt
  b.style.display = (APP.trades.length === 0 && API.isConfigured()) ? 'flex' : 'none';
}

// ── Init ────────────────────────────────────────────────────
async function _initApp() {
  // Dark mode — default ON (trading terminal), safe to read before auth
  const savedDark = Utils.LS.get('fifo_dark');
  APP.darkMode = savedDark !== '0';
  if (!APP.darkMode) document.body.classList.add('light');
  const btn = document.getElementById('dark-btn');
  if (btn) btn.textContent = APP.darkMode ? '☀️ Light' : '🌙 Dark';

  // load() clears in-memory state first, then fetches from the authenticated backend.
  // If it returns false (401 or network failure), do NOT render — the login screen
  // will already be shown by the 401 handler. Bail out here.
  const ok = await load();
  if (!ok) return;

  updateSeedBanner();
  renderAll();

  switchCategory('dashboard', document.querySelector('.nav-cat[data-cat="dashboard"]'));

  if (APP.positions.length > 0) Positions.refreshPrices();
  startPolling();

  setTimeout(checkProactiveCoach, 1500);
  Auth.saveLastVisit();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

(async () => {
  // Auth disabled — boot directly into the dashboard, no login screen.
  await _initApp();
})();

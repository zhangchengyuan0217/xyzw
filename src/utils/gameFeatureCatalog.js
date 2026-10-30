export const gameFeatures = [
  {
    id: "daily",
    title: "日常",
    description: "阵容、任务、爬塔和挂机",
    section: "daily",
  },
  {
    id: "club",
    title: "俱乐部",
    description: "俱乐部信息",
    section: "club",
  },
  {
    id: "activity",
    title: "活动",
    description: "月度任务和闯关",
    section: "activity",
  },
  {
    id: "camp",
    title: "营地挑战",
    description: "营地挑战",
    section: "campChallengeGroup",
  },
  {
    id: "warrank",
    title: "盐场",
    description: "盐场匹配",
    section: "saltFieldGroup",
    sub: "warrank",
  },
  {
    id: "week-battle",
    title: "本周盐场战绩",
    description: "查看本周盐场战绩",
    section: "saltFieldGroup",
    sub: "weekBattle",
  },
  {
    id: "month-battle",
    title: "本月盐场战绩",
    description: "查看本月盐场战绩",
    section: "saltFieldGroup",
    sub: "monthBattle",
  },
  {
    id: "war-map",
    title: "盐场地图",
    description: "查看盐场地图",
    section: "saltFieldGroup",
    sub: "legionWarMap",
  },
  {
    id: "war-stats",
    title: "盐场战况",
    description: "查看盐场战况",
    section: "saltFieldGroup",
    sub: "legionWarStatistics",
  },
  {
    id: "peach",
    title: "蟠桃园",
    description: "蟠桃园信息",
    section: "peachGroup",
    sub: "peach",
  },
  {
    id: "peach-battle",
    title: "蟠桃园战绩",
    description: "查看蟠桃园战绩",
    section: "peachGroup",
    sub: "peachBattle",
  },
  {
    id: "pvp",
    title: "切磋",
    description: "切磋对战",
    section: "fightPvp",
  },
];

export const findGameFeature = (id) =>
  gameFeatures.find((feature) => feature.id === id);

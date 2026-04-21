/**
 * @module weather
 *
 * 天气查询工具
 *
 * 基于 Open-Meteo 免费 API 实现实时天气查询，无需 API Key。
 * 流程：城市名 → Geocoding API 获取经纬度 → Weather API 获取天气数据
 */

import type { Tool } from '../types.js';

/** Open-Meteo Geocoding API 地址（城市名 → 经纬度） */
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
/** Open-Meteo Weather API 地址（经纬度 → 实时天气） */
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

/**
 * WMO 天气代码 → 中文描述映射表
 * 标准参考：https://open-meteo.com/en/docs#weathervariables
 */
const WMO_CODES: Record<number, string> = {
  0: '晴',
  1: '大部晴朗',
  2: '多云',
  3: '阴',
  45: '雾',
  48: '雾凇',
  51: '小毛毛雨',
  53: '中毛毛雨',
  55: '大毛毛雨',
  56: '冻毛毛雨',
  57: '强冻毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '冻雨',
  67: '强冻雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '雪粒',
  80: '小阵雨',
  81: '中阵雨',
  82: '强阵雨',
  85: '小阵雪',
  86: '大阵雪',
  95: '雷暴',
  96: '雷暴伴小冰雹',
  99: '雷暴伴大冰雹',
};

/**
 * Geocoding API 返回的地理位置数据结构
 */
interface GeoResult {
  /** 城市官方名称（英文或当地语言） */
  name: string;
  /** 纬度（-90 ~ 90） */
  latitude: number;
  /** 经度（-180 ~ 180） */
  longitude: number;
  /** 所属国家名称 */
  country: string;
}

/**
 * 内部天气数据结构，fetchWeather 的返回类型
 */
interface WeatherResult {
  /** 城市名称（由 geocode 结果填充） */
  city: string;
  /** 所属国家（由 geocode 结果填充） */
  country: string;
  /** 当前气温数值 */
  temperature: number;
  /** WMO 天气代码对应的中文描述（如"晴"、"中雨"） */
  weather: string;
  /** 原始 WMO 天气代码 */
  weatherCode: number;
  /** 相对湿度（0~100） */
  humidity: number;
  /** 10 米高度风速 */
  windSpeed: number;
  /** 各数值的单位字符串 */
  unit: {
    /** 气温单位，如 "°C" */
    temperature: string;
    /** 风速单位，如 "km/h" */
    windSpeed: string;
    /** 湿度单位，如 "%" */
    humidity: string;
  };
}

/**
 * 通过城市名称查询地理位置（经纬度）
 *
 * 调用 Open-Meteo Geocoding API，返回匹配度最高的第一条结果。
 *
 * @param city 城市名称（支持中文和英文）
 * @returns 找到时返回 GeoResult，API 调用失败或无结果时返回 null
 *
 * @example
 * const geo = await geocode('北京');
 * // => { name: 'Beijing', latitude: 39.9042, longitude: 116.4074, country: 'China' }
 *
 * const geo = await geocode('不存在的城市XYZ');
 * // => null
 */
async function geocode(city: string): Promise<GeoResult | null> {
  const url = `${GEOCODING_URL}?name=${encodeURIComponent(city)}&count=1&language=zh`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as { results?: GeoResult[] };
  return data.results?.[0] ?? null;
}

/**
 * 根据经纬度获取当前实时天气数据
 *
 * 调用 Open-Meteo Weather API 获取气温、天气状况、风速和湿度。
 * 返回的 city 和 country 字段为空字符串，需由调用方（getWeather.run）填充。
 *
 * @param lat 纬度
 * @param lon 经度
 * @returns 成功时返回 WeatherResult，API 调用失败时返回 null
 *
 * @example
 * // 北京经纬度：39.9042, 116.4074
 * const weather = await fetchWeather(39.9042, 116.4074);
 * // => {
 * //   city: '',
 * //   country: '',
 * //   temperature: 28,
 * //   weather: '晴',
 * //   weatherCode: 0,
 * //   humidity: 45,
 * //   windSpeed: 12.3,
 * //   unit: { temperature: '°C', windSpeed: 'km/h', humidity: '%' },
 * // }
 */
async function fetchWeather(lat: number, lon: number): Promise<WeatherResult | null> {
  const url = `${WEATHER_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    current: {
      temperature_2m: number;
      weather_code: number;
      wind_speed_10m: number;
      relative_humidity_2m: number;
    };
    current_units: {
      temperature_2m: string;
      wind_speed_10m: string;
      relative_humidity_2m: string;
    };
  };
  const c = data.current;
  const u = data.current_units;
  return {
    city: '',
    country: '',
    temperature: c.temperature_2m,
    weather: WMO_CODES[c.weather_code] ?? `未知(${c.weather_code})`,
    weatherCode: c.weather_code,
    humidity: c.relative_humidity_2m,
    windSpeed: c.wind_speed_10m,
    unit: {
      temperature: u.temperature_2m,
      windSpeed: u.wind_speed_10m,
      humidity: u.relative_humidity_2m,
    },
  };
}

/**
 * getWeather 工具
 *
 * 获取指定城市的实时天气信息，包括气温、天气状况、相对湿度和风速。
 * 内部先通过 geocode 解析城市名到经纬度，再调用 Open-Meteo 获取天气数据。
 *
 * @example
 * // 通过 executor 调用
 * const result = await execute({
 *   type: 'tool',
 *   name: 'getWeather',
 *   input: { city: '上海' },
 * });
 * // => {
 * //   city: 'Shanghai',
 * //   country: 'China',
 * //   temperature: 32,
 * //   temperatureUnit: '°C',
 * //   weather: '多云',
 * //   humidity: 78,
 * //   humidityUnit: '%',
 * //   windSpeed: 8.5,
 * //   windSpeedUnit: 'km/h',
 * // }
 *
 * @example
 * // 城市不存在时返回错误对象
 * const result = await getWeather.run({ city: '不存在XYZ' });
 * // => { error: '无法找到城市「不存在XYZ」的地理位置信息' }
 */
export const getWeather: Tool = {
  name: 'getWeather',
  description: '获取指定城市的实时天气信息（气温、天气状况、湿度、风速）',
  schema: {
    type: 'object',
    properties: {
      city: { type: 'string', description: '城市名称' },
    },
    required: ['city'],
  },
  async run(input) {
    const city = input.city as string;

    const geo = await geocode(city);
    if (!geo) {
      return { error: `无法找到城市「${city}」的地理位置信息` };
    }

    const weather = await fetchWeather(geo.latitude, geo.longitude);
    if (!weather) {
      return { error: `获取「${city}」天气数据失败` };
    }

    return {
      city: geo.name,
      country: geo.country,
      temperature: weather.temperature,
      temperatureUnit: weather.unit.temperature,
      weather: weather.weather,
      humidity: weather.humidity,
      humidityUnit: weather.unit.humidity,
      windSpeed: weather.windSpeed,
      windSpeedUnit: weather.unit.windSpeed,
    };
  },
};

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Кэш для хранения данных
const cache = {
    groups: null,
    teachers: null,
    lastUpdate: null,
    cacheTime: 1000 * 60 * 60 // 1 час
};

// Загрузка данных о преподавателях
function loadTeachers() {
    try {
        const teachersData = fs.readFileSync('teachers.txt', 'utf8');
        return JSON.parse(teachersData);
    } catch (error) {
        console.error('Ошибка при загрузке данных о преподавателях:', error);
        return {};
    }
}

// Функция для получения текущей учебной недели
function getCurrentWeek() {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), 8, 1); // 1 сентября
    const diffTime = Math.abs(now - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.ceil(diffDays / 7);
}

// Функция для создания расписания
function createSchedule(info, times, week) {
    const schedule = {
        week: week,
        days: {
            monday: [],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: [],
            saturday: []
        }
    };

    let index = 0;
    for (const time of times) {
        for (const day in schedule.days) {
            if (index < info.length) {
                schedule.days[day].push({
                    time: time,
                    info: info[index]
                });
                index++;
            }
        }
    }

    return schedule;
}

// API для получения списка групп
app.get('/api/groups', async (req, res) => {
    try {
        // Проверяем кэш
        if (cache.groups && cache.lastUpdate && 
            (Date.now() - cache.lastUpdate) < cache.cacheTime) {
            return res.json(cache.groups);
        }

        const groups = {};
        // Получаем группы для каждого курса (1-5)
        for (let course = 1; course <= 5; course++) {
            const response = await axios.get(`https://ssau.ru/rasp/faculty/492430598?course=${course}`);
            const $ = cheerio.load(response.data);
            
            $('.group-catalog__group').each((i, elem) => {
                const groupName = $(elem).text().trim();
                const groupId = $(elem).attr('href').split('=')[1];
                groups[groupName] = groupId;
            });
        }

        // Обновляем кэш
        cache.groups = groups;
        cache.lastUpdate = Date.now();
        
        res.json(groups);
    } catch (error) {
        console.error('Ошибка при парсинге групп:', error);
        res.status(500).json({ error: 'Ошибка при получении списка групп' });
    }
});

// API для получения списка преподавателей
app.get('/api/teachers', (req, res) => {
    try {
        if (!cache.teachers) {
            cache.teachers = loadTeachers();
        }
        res.json(cache.teachers);
    } catch (error) {
        console.error('Ошибка при получении списка преподавателей:', error);
        res.status(500).json({ error: 'Ошибка при получении списка преподавателей' });
    }
});

// API для получения расписания
app.get('/api/schedule/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { week = getCurrentWeek(), type = 'group' } = req.query;
        
        let url;
        if (type === 'teacher') {
            url = `https://ssau.ru/rasp?staffId=${id}&week=${week}`;
        } else {
            url = `https://ssau.ru/rasp?groupId=${id}&week=${week}`;
        }
        
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        
        const info = [];
        const times = [];

        // Получаем информацию о предметах
        $('.schedule__item').each((i, elem) => {
            const lessonInfo = [];
            
            // Названия предметов
            $(elem).find('.body-text').each((j, text) => {
                lessonInfo.push($(text).text().trim());
            });
            
            // Места проведения
            $(elem).find('.schedule__place').each((j, place) => {
                lessonInfo.push($(place).text().trim());
            });
            
            // Преподаватели и группы
            $(elem).find('a.caption-text').each((j, link) => {
                lessonInfo.push($(link).text().trim());
            });
            
            info.push(lessonInfo.join(' '));
        });

        // Получаем времена занятий
        $('.schedule__time').each((i, elem) => {
            times.push($(elem).text().trim());
        });

        // Получаем текущую неделю
        const currentWeek = $('.week-nav-current_week').text().trim();

        const schedule = createSchedule(info, times, currentWeek);
        res.json(schedule);
    } catch (error) {
        console.error('Ошибка при парсинге расписания:', error);
        res.status(500).json({ error: 'Ошибка при получении расписания' });
    }
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
}); 
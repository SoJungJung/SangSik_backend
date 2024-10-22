const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
const PORT = process.env.PORT || 5001;

const { Pool } = require('pg');
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'sangsikdb',
    password: '1234',
    port: 5432,
});

// 미들웨어 설정
app.use(cors());
app.use(bodyParser.json());

// 로깅 미들웨어 설정 (모든 요청에 대해 로그 출력)
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} 요청: ${req.url}`);
    console.log('요청 바디:', req.body);
    next();
});

// 사용자 점수 제출 엔드포인트
app.post('/api/submit-score', async (req, res) => {
    const { device_id, ip_address, score, nickname } = req.body;

    try {
        // 기존 사용자 확인
        console.log('점수 제출 요청 데이터:', req.body);
        const existingUser = await pool.query(
            'SELECT * FROM ranking WHERE device_id = $1 ORDER BY datetime DESC LIMIT 1',
            [device_id]
        );

        let high_score = score;

        if (existingUser.rows.length > 0) {
            // 현재 점수가 더 높으면 high_score 업데이트
            high_score = Math.max(score, existingUser.rows[0].high_score);
            console.log(
                `기존 사용자 발견: 기존 최고 점수 = ${existingUser.rows[0].high_score}, 제출된 점수 = ${score}, 최종 최고 점수 = ${high_score}`
            );

            // 기존 사용자의 점수 업데이트
            await pool.query(
                `UPDATE ranking
                 SET score = $1, nickname = $2, high_score = $3, datetime = NOW()
                 WHERE device_id = $4`,
                [score, nickname, high_score, device_id]
            );
        } else {
            // 새로운 사용자라면 데이터 삽입
            await pool.query(
                `INSERT INTO ranking (device_id, ip_address, score, nickname, high_score)
                VALUES ($1, $2, $3, $4, $5)`,
                [device_id, ip_address, score, nickname, high_score]
            );
        }

        console.log(
            `점수가 성공적으로 제출되었습니다: 닉네임 = ${nickname}, 점수 = ${score}, 최고 점수 = ${high_score}`
        );
        res.json({ message: '점수가 성공적으로 제출되었습니다' });
    } catch (err) {
        console.error('점수 제출 오류:', err);
        res.status(500).json({ error: '점수를 제출하지 못했습니다' });
    }
});

// 랭킹 가져오기 엔드포인트
app.get('/api/ranking', async (req, res) => {
    try {
        console.log('랭킹 데이터 요청을 받았습니다.');

        // 각 device_id의 최고 점수(high_score)만 가져옴
        const result = await pool.query(
            `SELECT DISTINCT ON (device_id) nickname, high_score
            FROM ranking
            ORDER BY device_id, high_score DESC, datetime ASC
            LIMIT 100`
        );

        console.log('랭킹 데이터를 성공적으로 조회했습니다.');
        res.json({ rankings: result.rows });
    } catch (err) {
        console.error('랭킹 조회 오류:', err);
        res.status(500).json({ error: '랭킹을 가져오지 못했습니다' });
    }
});

// 오류 처리 미들웨어 (예외 처리)
app.use((err, req, res, next) => {
    console.error('서버 오류:', err.stack);
    res.status(500).send('서버에 문제가 발생했습니다!');
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`서버가 ${PORT} 포트에서 실행 중입니다`);
});

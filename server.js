// server.js
require('dotenv').config(); // .env 파일의 환경변수 로드
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;

// PostgreSQL Pool 설정
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, // .env에서 DATABASE_URL 로드
});

// 미들웨어 설정
app.use(
    cors({
        // 프론트엔드 앱 주소 (예시: cloudtype.app)
        origin: 'https://web-sangsikquiz-m2l7w1ydc2132f7e.sel4.cloudtype.app',
    })
);
app.use(express.json());
app.use(bodyParser.json());

// 간단한 테스트 라우트
app.get('/api/ping', (req, res) => {
    res.json({ message: 'Backend is connected successfully!' });
});

// 로깅 미들웨어 (모든 요청에 대해 로그를 찍음)
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} 요청: ${req.url}`);
    console.log('요청 바디:', req.body);
    next();
});

/**
 * /api/submit-score
 * - 클라이언트로부터 device_id, score, nickname을 받아,
 *   이미 존재하는 device_id면 high_score 갱신,
 *   처음이면 새로 삽입
 */
app.post('/api/submit-score', async (req, res) => {
    const { device_id, score, nickname, ip_address } = req.body;
    // 기본적으로 클라이언트 IP를 가져오되, body에 ip_address 있으면 우선
    const clientIp = ip_address || req.ip;

    try {
        console.log('점수 제출 요청 데이터:', req.body);
        const existingUser = await pool.query(
            'SELECT * FROM ranking WHERE device_id = $1 ORDER BY datetime DESC LIMIT 1',
            [device_id]
        );

        let high_score = score;

        if (existingUser.rows.length > 0) {
            // 기존 사용자: 최고점수 비교 후 업데이트
            high_score = Math.max(score, existingUser.rows[0].high_score);

            await pool.query(
                `UPDATE ranking
         SET score = $1, nickname = $2, high_score = $3, datetime = NOW()
         WHERE device_id = $4`,
                [score, nickname, high_score, device_id]
            );
        } else {
            // 새로운 사용자
            await pool.query(
                `INSERT INTO ranking (device_id, ip_address, score, nickname, high_score)
         VALUES ($1, $2, $3, $4, $5)`,
                [device_id, clientIp, score, nickname, high_score]
            );
        }

        console.log(`점수가 성공적으로 제출되었습니다: 닉네임=${nickname}, 점수=${score}, 최고 점수=${high_score}`);
        res.json({ message: '점수가 성공적으로 제출되었습니다' });
    } catch (err) {
        console.error('점수 제출 오류:', err);
        res.status(500).json({ error: '점수를 제출하지 못했습니다' });
    }
});

/**
 * /api/ranking
 * - 랭킹 상위 100명(혹은 기기)을 가져옴.
 * - 각 device_id별 가장 높은 high_score만 확인
 * - 그리고 그 점수들(고유 device_id)로 정렬 (내림차순)
 * - 순위를 매기기 위해 ROW_NUMBER() 사용 -> 1,2,3,...
 *   (동점자라도 다른 순위)
 */
app.get('/api/ranking', async (req, res) => {
    try {
        console.log('랭킹 데이터 요청을 받았습니다.');

        // “한 기기(device_id)당 한 개”의 최고점 기록만 반영
        // ROW_NUMBER() -> 단순 등수(동점자도 1,2,3,...)
        const result = await pool.query(`
      SELECT nickname, high_score,
             ROW_NUMBER() OVER (ORDER BY high_score DESC) AS position
      FROM (
          SELECT device_id, nickname, high_score,
                 ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY high_score DESC) AS rn
          FROM ranking
      ) subquery
      WHERE rn = 1
      ORDER BY high_score DESC
      LIMIT 100
    `);

        console.log('랭킹 데이터를 성공적으로 조회했습니다.');
        res.json({ rankings: result.rows });
    } catch (err) {
        console.error('랭킹 조회 오류:', err);
        res.status(500).json({ error: '랭킹을 가져오지 못했습니다' });
    }
});

// 오류 처리(예외 처리) 미들웨어
app.use((err, req, res, next) => {
    console.error('서버 오류:', err.stack);
    res.status(500).send('서버에 문제가 발생했습니다!');
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`서버가 ${PORT} 포트에서 실행 중입니다`);
});

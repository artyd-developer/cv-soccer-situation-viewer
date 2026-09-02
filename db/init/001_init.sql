CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS scenes (
    id BIGSERIAL PRIMARY KEY,

    name VARCHAR(255),

    accepted BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS objects (
    id BIGSERIAL PRIMARY KEY,

    scene_id BIGINT NOT NULL
        REFERENCES scenes(id)
        ON DELETE CASCADE,

    type VARCHAR(50) NOT NULL,

    color_vector vector(192),

    CONSTRAINT objects_valid_type
        CHECK (
            type IN (
                'teammate',
                'opponent',
                'ball',
                'unknown'
            ) 
        )
);

CREATE TABLE IF NOT EXISTS positions (
    id BIGSERIAL PRIMARY KEY,

    object_id BIGINT NOT NULL
        REFERENCES objects(id)
        ON DELETE CASCADE,

    frame INTEGER NOT NULL,

    x DOUBLE PRECISION NOT NULL,
    y DOUBLE PRECISION NOT NULL,
    z DOUBLE PRECISION NOT NULL,

    direction_angle DOUBLE PRECISION,

    confidence DOUBLE PRECISION,

    CONSTRAINT positions_valid_frame
        CHECK (frame >= 0),

    CONSTRAINT positions_valid_confidence
        CHECK (
            confidence IS NULL
            OR (
                confidence >= 0
                AND confidence <= 1
            )
        )
);

CREATE INDEX IF NOT EXISTS idx_objects_scene_id
    ON objects(scene_id);

CREATE INDEX IF NOT EXISTS idx_positions_object_id
    ON positions(object_id);

CREATE INDEX IF NOT EXISTS idx_positions_object_frame
    ON positions(object_id, frame);

CREATE INDEX IF NOT EXISTS idx_positions_frame
    ON positions(frame);
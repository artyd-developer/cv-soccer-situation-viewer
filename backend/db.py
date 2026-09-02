import os
import psycopg
from pgvector import Vector
from pgvector.psycopg import register_vector
from math import atan2

DATABASE_URL = os.getenv("DATABASE_URL")


def _get_db_connection():
    """Create and configure a PostgreSQL database connection.

    Returns:
        An active PostgreSQL connection with pgvector support enabled.

    Raises:
        RuntimeError: If the DATABASE_URL environment variable is not set.
    """
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set")

    connection = psycopg.connect(DATABASE_URL)
    register_vector(connection)
    return connection


def average_vectors(vectors):
    """Calculate the element-wise average of vectors.

    Vectors with a different dimensionality from the first vector
    are ignored.

    Args:
        vectors: A list of numeric vectors with the same dimensionality.

    Returns:
        The averaged vector, or None if no valid vectors are provided.
    """
    if not vectors:
        return None

    size = len(vectors[0])
    result = [0.0] * size
    count = 0

    for vector in vectors:
        if len(vector) != size:
            continue

        for i, value in enumerate(vector):
            result[i] += float(value)

        count += 1

    if count == 0:
        return None

    return [value / count for value in result]


def save_scene(name, objects_tracking):
    """Save an analyzed scene and its tracked objects to the database.

    For each tracked object, its average color vector and final position
    are stored. The movement direction is calculated from the first and
    last detected positions.

    Args:
        name: Human-readable name of the scene.
        objects_tracking: Tracking data grouped by detected object class.

    Returns:
        The database ID of the newly created scene.
    """
    with _get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO scenes (name)
                VALUES (%s)
                RETURNING id
                """,
                (name,),
            )

            scene_id = cursor.fetchone()[0]

            for object_type, objects in objects_tracking.items():
                db_type = (
                    "ball"
                    if object_type in ("ball", "sports ball")
                    else "unknown"
                )

                for boxes in objects.values():
                    if not boxes:
                        continue

                    color_vectors = [
                        box["color_vector"]
                        for box in boxes
                        if box.get("color_vector")
                    ]

                    color_vector = average_vectors(color_vectors)

                    vector_value = (
                        Vector(color_vector)
                        if color_vector is not None
                        else None
                    )

                    cursor.execute(
                        """
                        INSERT INTO objects (
                            scene_id,
                            type,
                            color_vector
                        )
                        VALUES (%s, %s, %s)
                        RETURNING id
                        """,
                        (
                            scene_id,
                            db_type,
                            vector_value,
                        ),
                    )

                    database_object_id = cursor.fetchone()[0]

                    last_box = boxes[-1]

                    center_x = (last_box["x1"] + last_box["x2"]) / 2
                    center_y = (last_box["y1"] + last_box["y2"]) / 2

                    first_box = boxes[0]

                    first_center_x = (first_box["x1"] + first_box["x2"]) / 2
                    first_center_y = (first_box["y1"] + first_box["y2"]) / 2

                    delta_x = center_x - first_center_x
                    delta_z = center_y - first_center_y

                    if abs(delta_x) < 1e-6 and abs(delta_z) < 1e-6:
                        direction_angle = None
                    else:
                        direction_angle = atan2(delta_x, delta_z)

                    cursor.execute(
                        """
                        INSERT INTO positions (
                            object_id,
                            frame,
                            x,
                            y,
                            z,
                            direction_angle
                        )
                        VALUES (%s, %s, %s, %s, %s, %s)
                        """,
                        (
                            database_object_id,
                            last_box["frame"],
                            center_x,
                            1.0,
                            center_y,  # 2D Y coordinate is mapped to 3D Z.
                            direction_angle,
                        ),
                    )

            connection.commit()

            return scene_id


def get_scene(scene_id):
    """Load a scene and its objects from the database.

    Args:
        scene_id: Unique database identifier of the scene.

    Returns:
        A dictionary containing scene metadata and objects,
        or None if the scene does not exist.
    """
    with _get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    s.id,
                    s.name,
                    s.created_at
                FROM scenes s
                WHERE s.id = %s
                """,
                (scene_id,),
            )

            scene_row = cursor.fetchone()

            if scene_row is None:
                return None

            cursor.execute(
                """
                SELECT
                    o.id,
                    o.type,
                    o.color_vector,
                    p.frame,
                    p.x,
                    p.y,
                    p.z,
                    p.confidence,
                    p.direction_angle
                FROM objects o
                LEFT JOIN positions p
                    ON p.object_id = o.id
                WHERE o.scene_id = %s
                ORDER BY o.id
                """,
                (scene_id,),
            )

            object_rows = cursor.fetchall()
            objects = []

            for row in object_rows:
                (
                    object_id,
                    object_type,
                    color_vector,
                    frame,
                    x,
                    y,
                    z,
                    confidence,
                    direction_angle,
                ) = row

                objects.append(
                    {
                        "id": object_id,
                        "type": object_type,
                        "frame": frame,
                        "x": x,
                        "y": y,
                        "z": z,
                        "confidence": confidence,
                        "direction_angle": direction_angle,
                    }
                )

            return {
                "id": scene_row[0],
                "name": scene_row[1],
                "created_at": scene_row[2].isoformat(),
                "objects": objects,
            }


def get_scene_objects(scene_id):
    """Load the latest position of every object in a scene.

    Args:
        scene_id: Unique database identifier of the scene.

    Returns:
        A list of objects with their type, color vector, and latest
        known position.
    """
    with _get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    o.id,
                    o.type,
                    o.color_vector,
                    p.frame,
                    p.x,
                    p.y,
                    p.z,
                    p.direction_angle
                FROM objects o
                LEFT JOIN LATERAL (
                    SELECT
                        frame,
                        x,
                        y,
                        z,
                        direction_angle
                    FROM positions
                    WHERE object_id = o.id
                    ORDER BY frame DESC
                    LIMIT 1
                ) p ON TRUE
                WHERE o.scene_id = %s
                ORDER BY o.id
                """,
                (scene_id,),
            )

            rows = cursor.fetchall()

    objects = []

    for row in rows:
        (
            object_id,
            object_type,
            color_vector,
            frame,
            x,
            y,
            z,
            direction_angle,
        ) = row

        if color_vector is not None:
            color_vector = color_vector.to_list()

        position = None

        if frame is not None:
            position = {
                "frame": int(frame),
                "x": float(x),
                "y": float(y),
                "z": float(z),
                "direction_angle": (
                    float(direction_angle)
                    if direction_angle is not None
                    else None
                ),
            }

        objects.append(
            {
                "id": int(object_id),
                "type": object_type,
                "color_vector": color_vector,
                "position": position,
            }
        )

    return objects


def get_scene_object_groups(scene_id, similarity_percent):
    """Group non-ball scene objects by color-vector similarity.

    Args:
        scene_id: Unique database identifier of the scene.
        similarity_percent: Minimum cosine similarity expressed
            as a percentage.

    Returns:
        A list of object groups containing their averaged color vector
        and member objects.
    """
    threshold = similarity_percent / 100.0

    with _get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                WITH objects_with_group AS (
                    SELECT
                        o.id,
                        o.scene_id,
                        o.color_vector,
                        (
                            SELECT MIN(o2.id)
                            FROM objects o2
                            WHERE o2.scene_id = o.scene_id
                              AND o2.type <> 'ball'
                              AND o2.color_vector IS NOT NULL
                              AND 1 - (
                                  o.color_vector <=> o2.color_vector
                              ) >= %s
                        ) AS group_id
                    FROM objects o
                    WHERE o.scene_id = %s
                      AND o.type <> 'ball'
                      AND o.color_vector IS NOT NULL
                )
                SELECT
                    scene_id,
                    group_id,
                    ARRAY_AGG(id ORDER BY id) AS object_ids
                FROM objects_with_group
                GROUP BY scene_id, group_id
                ORDER BY group_id
                """,
                (
                    threshold,
                    scene_id,
                ),
            )

            rows = cursor.fetchall()

            object_ids = [
                object_id
                for _, _, ids in rows
                for object_id in ids
            ]

            if not object_ids:
                return []

            cursor.execute(
                """
                SELECT
                    id,
                    type,
                    color_vector
                FROM objects
                WHERE id = ANY(%s)
                """,
                (object_ids,),
            )

            object_rows = cursor.fetchall()

    vectors_by_id = {
        int(object_id): color_vector.to_list()
        for object_id, _, color_vector in object_rows
        if color_vector is not None
    }

    types_by_id = {
        int(object_id): object_type
        for object_id, object_type, _ in object_rows
    }

    groups = []

    for _, group_id, group_object_ids in rows:
        vectors = [
            vectors_by_id[object_id]
            for object_id in group_object_ids
            if object_id in vectors_by_id
        ]

        groups.append(
            {
                "group_id": int(group_id),
                "color_vector": average_vectors(vectors),
                "objects": [
                    {
                        "id": int(object_id),
                        "type": types_by_id[object_id],
                    }
                    for object_id in group_object_ids
                ],
            }
        )

    return groups


def save_scene_scheme(scene_id, object_teams):
    """Save manually assigned team types for scene objects.

    Ball objects cannot be reassigned. Successfully processed scenes
    are marked as accepted.

    Args:
        scene_id: Unique database identifier of the scene.
        object_teams: Mapping of object IDs to team types. Allowed
            types are "teammate", "opponent", and "unknown".

    Raises:
        ValueError: If the scene does not exist or an invalid object
            type is provided.

    Returns:
        The number of objects successfully updated.
    """
    allowed_types = {
        "teammate",
        "opponent",
        "unknown",
    }

    with _get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id
                FROM scenes
                WHERE id = %s
                """,
                (scene_id,),
            )

            if cursor.fetchone() is None:
                raise ValueError("Scene not found")

            updated = 0

            for object_id, object_type in object_teams.items():
                if object_type not in allowed_types:
                    raise ValueError(
                        f"Invalid object type: {object_type}"
                    )

                cursor.execute(
                    """
                    UPDATE objects
                    SET type = %s
                    WHERE id = %s
                      AND scene_id = %s
                      AND type <> 'ball'
                    """,
                    (
                        object_type,
                        int(object_id),
                        scene_id,
                    ),
                )

                updated += cursor.rowcount

            cursor.execute(
                """
                UPDATE scenes
                SET accepted = TRUE
                WHERE id = %s
                """,
                (scene_id,),
            )

            connection.commit()

            return updated


def get_viewer_scenes():
    """Return all scenes that have been accepted for viewing.

    Returns:
        A list of accepted scenes with their metadata.
    """
    with _get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    id,
                    name,
                    accepted,
                    created_at
                FROM scenes
                WHERE accepted = TRUE
                ORDER BY id
                """
            )

            rows = cursor.fetchall()

    return [
        {
            "id": row[0],
            "name": row[1],
            "accepted": row[2],
            "created_at": row[3],
        }
        for row in rows
    ]


def get_viewer_scene(scene_id):
    """Load complete tracking data for an accepted scene.

    Args:
        scene_id: Unique database identifier of the scene.

    Returns:
        A dictionary containing scene metadata and all tracked object
        positions, or None if the scene does not exist or is not accepted.
    """
    with _get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    id,
                    name,
                    accepted,
                    created_at
                FROM scenes
                WHERE id = %s
                  AND accepted = TRUE
                """,
                (scene_id,),
            )

            scene = cursor.fetchone()

            if scene is None:
                return None

            cursor.execute(
                """
                SELECT
                    o.id,
                    o.type,
                    p.frame,
                    p.x,
                    p.y,
                    p.z,
                    p.confidence,
                    p.direction_angle
                FROM objects o
                LEFT JOIN positions p
                    ON p.object_id = o.id
                WHERE o.scene_id = %s
                ORDER BY
                    o.id,
                    p.frame
                """,
                (scene_id,),
            )

            rows = cursor.fetchall()

    objects_map = {}

    for row in rows:
        (
            object_id,
            object_type,
            frame,
            x,
            y,
            z,
            confidence,
            direction_angle,
        ) = row

        if object_id not in objects_map:
            objects_map[object_id] = {
                "id": object_id,
                "type": object_type,
                "positions": [],
            }

        if frame is not None:
            objects_map[object_id]["positions"].append(
                {
                    "frame": frame,
                    "x": x,
                    "y": y,
                    "z": z,
                    "confidence": confidence,
                    "direction_angle": (
                        float(direction_angle)
                        if direction_angle is not None
                        else None
                    ),
                }
            )

    return {
        "scene": {
            "id": scene[0],
            "name": scene[1],
            "accepted": scene[2],
            "created_at": scene[3],
        },
        "fps": 5,
        "objects": list(objects_map.values()),
    }


def check_database():
    """Check whether the database connection and query execution work.

    Returns:
        The result of the database connectivity check.
    """
    with _get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            result = cursor.fetchone()

    return result[0]
# QuestClass Student Database v1

## Collections

### `users/{uid}`
登入使用者資料與角色。

Key fields:
- `name`
- `email`
- `role` → `student | teacher | admin`
- `requestedRole`
- `learnerStage`
- `roleNote`
- `accountStatus`

### `students/{studentId}`
學生主檔，供 teacher/student 首頁使用。

Key fields:
- `userUid` → 對應 Firebase Auth uid（若有）
- `name`
- `gradeLevel`
- `classroomIds[]`
- `primaryTeacherUid`
- `currentLevel`
- `xp`
- `nextLevelXp`
- `streak`
- `mastery`
- `weaknessLabel`
- `weaknessScore`
- `focusSkills[]`

### `classrooms/{classroomId}`
班級主檔。

Key fields:
- `name`
- `grade`
- `subject`
- `teacherUid`
- `teacherUids[]`
- `studentIds[]`
- `studentUids[]`
- `activeStudents`
- `completionRate`

### `submissions/{submissionId}`
學生作業提交。

Key fields:
- `classroomId`
- `studentId`
- `studentUid`
- `assignmentTitle`
- `topic`
- `score`
- `status`
- `feedback`
- `submittedAt`

### `progressSummaries/{studentId}`
每位學生一份摘要，文件 id 直接等於 `studentId`。

Key fields:
- `studentId`
- `userUid`
- `classroomId`
- `mastery`
- `level`
- `xp`
- `nextLevelXp`
- `streak`
- `weaknessLabel`
- `weaknessScore`
- `focusAreas[]`
- `recentQuestTitles[]`

## Current app usage

### Teacher page
Reads:
- `classrooms`
- `students`
- `progressSummaries`
- `submissions`

### Student page
Reads:
- the signed-in student's `students` doc
- matching `progressSummaries` doc
- recent `submissions`
- visible `classrooms`

## Notes

- `users` remains the auth/profile source of truth.
- `students` is intentionally separate from `users` so teacher dashboards can work even when some students do not yet have direct logins.
- `progressSummaries` is denormalized on purpose for cheap page loads in v1.
- `submissions` remains flat for simple querying and Vercel/client compatibility.

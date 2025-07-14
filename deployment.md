### MongoDB sign up

https://www.mongodb.com/zh-cn/lp/cloud/atlas/try4-reg?utm_source=compass&utm_medium=product&utm_content=v1    

### MongoDB cluster connection

mongodb+srv://li9021905:O0ysxh06MjzWUD5o@cluster0.ipcieg1.mongodb.net/

username:
li9021905

password:
O0ysxh06MjzWUD5o




//后端测试
您可以使用 Postman 或 curl 测试后端 API：

1. 用户注册
bash
curl -X POST http://localhost:5000/api/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"username\": \"testuser\", \"password\": \"testpassword\"}"

2. 用户登录
bash
curl -X POST http://localhost:5000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"username\": \"testuser\", \"password\": \"testpassword\"}"

3. 上传文件（需要先登录获取 token）
bash
curl -X POST http://localhost:5000/api/files/upload ^
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" ^
  -F "file=@/path/to/your/file.jpg"

curl -X POST http://localhost:5000/api/files/upload ^
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4NmRkYTcyZTgzMDE5ZTgxNzAxMGVlZSIsImlhdCI6MTc1MjAyOTgzMywiZXhwIjoxNzUyMDMzNDMzfQ.oAZz7AAfD1LQNLpaF6sVCUM6ro0TpP5T1-b3_SdjcSU" ^
  -F "file=@F:\\Code\\NAS\\localfile\\text.txt"

4. 获取文件列表
bash
curl -X GET http://localhost:5000/api/files ^
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>"

curl -X GET http://localhost:5000/api/files ^
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4NmRkYTcyZTgzMDE5ZTgxNzAxMGVlZSIsImlhdCI6MTc1MjAyOTgzMywiZXhwIjoxNzUyMDMzNDMzfQ.oAZz7AAfD1LQNLpaF6sVCUM6ro0TpP5T1-b3_SdjcSU"



5 创建admin用户
curl -X POST http://localhost:5000/api/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"username\":\"admin\",\"password\":\"adminpassword\",\"role\":\"admin\"}"

admin 用户重新登录
curl -X POST http://localhost:5000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"username\":\"admin\",\"password\":\"adminpassword\",\"role\":\"admin\"}"


6 一次性初始化  删除所有用户  不需admin
   curl -X DELETE http://localhost:5000/api/users/all-force

7  用admin删除所有文件
   curl -X DELETE http://localhost:5000/api/files/all ^
     -H "Authorization: Bearer <你的admin_token>"

curl -X DELETE http://localhost:5000/api/files/all ^
     -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4NmUzNDY3ZmQ4YTBkNjA4YzJjZTg4NCIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc1MjA1MjgzOSwiZXhwIjoxNzUyMDU2NDM5fQ.2J8FdLQsnAbXuV0_9kYXQIXxx12_ltRtmxymsnjAOoU"


8 重置当前使用空间为0
   curl -X POST http://localhost:5000/api/users/reset-used ^
     -H "Authorization: Bearer <你的token>"
   
  curl -X POST http://localhost:5000/api/users/reset-used ^
     -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4NmUzNDY3ZmQ4YTBkNjA4YzJjZTg4NCIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc1MjA1Nzc1MywiZXhwIjoxNzUyMDYxMzUzfQ.L1trXwIVPbTkBDNULuPRq3pcjlERuvg90HAgSOTwHgU"



现在完成这个操作   ：1. 新用户注册输入用户名 密码    确认密码后必须让管理员同意  管理员能看到所有历史注册请求  并且 能够进行拒绝或同意   2.第一个注册的是最高级管理员prime admin； admin管理员能看见所有用户 并能删除用户或者更改normal用户权限   最高级管理员能删改包括admin normal在内的用户的账号和用户权限 3. prime和admin管理员能在前端跳转到“团队成员”页面看见用户列表和注册时间 用户权限等信息的表格   不要改前端的配色     一步步来   先完成第一步



@FileUpload.js 对于云文件可以存成文件管理器那种文件夹分级格式 
上传的时候可以选择上传位置 也可以新建文件夹  弹窗做成文件管理器一致的模式和格式   filelist也要改  
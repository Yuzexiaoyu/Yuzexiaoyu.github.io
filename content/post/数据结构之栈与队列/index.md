---
title: 数据结构之栈与队列
date: 2026-05-16
lastmod: 2026-05-16
weight: 2
description: 栈和队列的实现与运用。
image: fire.jpg
comments: true
---
栈和队列是两种重要的线性结构，它们是操作受限的线性表。
## 顺序栈
### 定义
首先，我们要先定义顺序栈的结构
```c
#include<stdio.h>
#include<stdlib.h>
#define MAXSIZE 100 // 最大容量
typedef struct
{
	int data[MAXSIZE]; // 存储空间
	int top; // 栈顶指针
} SqStack;

```
### 初始化
```c
void InitStack(SqStack* S)
{
	S->top = 0; 
}
```
### 判断空栈
```c
int StackEmpty(SqStack* S)
{
	if (S->top == 0)
		return 1; // 空栈
	else
		return 0; // 非空栈
}
```
### 判断栈满
```c
int StackFull(SqStack* S)
{
	if (S->top == MAXSIZE)
		return 1; // 栈满
	else
		return 0; // 非满栈
}
```
### 入栈
```c
int Push(SqStack* S, int e)
{
	if (StackFull(S))
		return 0; 
	S->data[S->top] = e; 
	S->top++; 
	return 1; 
}
```
### 出栈
```c
int Pop(SqStack* S, int* e)
{
	if (StackEmpty(S))
		return 0; 
	S->top--; 
	*e = S->data[S->top]; 
	return 1; 
}
```
### 打印
```c
void PrintStack(SqStack* S)
{
	int i;
	for (i = S->top - 1; i >= 0; i--)
	{
		printf("%d ", S->data[i]);
	}
	printf("\n");
}
```
### 测试环节
```c
int main()
{
	SqStack S;
	int e;
	printf("初始化栈\n");
	InitStack(&S);
	printf("初始化完成!\n");
	printf("\n");
	printf("依次入栈1，2，3：");
	Push(&S, 1);
	Push(&S, 2);
	Push(&S, 3);
	printf("\n");
	printf("入栈成功\n");
	printf("打印元素：");
	PrintStack(&S);
	printf("\n");
	printf("元素出栈：");
	Pop(&S, &e);
	printf("弹出的元素为：%d\n", e);
	printf("打印元素：");
	PrintStack(&S);
	printf("\n");
	return 0;
}
```
输出如下：
```html
初始化栈
初始化完成!

依次入栈1，2，3：
入栈成功
打印元素：3 2 1

元素出栈：弹出的元素为：3
打印元素：2 1
```
## 链栈
### 定义
```c
#include <stdio.h>
#include <stdlib.h>
typedef struct StackNode
{
    int data;
    struct StackNode* next; // 指向先进结点
} StackNode;
typedef StackNode* LinkStack;
```
### 初始化
```c
void InitStack(LinkStack* S)
{
    *S = NULL;
}
```
### 判空
```c
int StackEmpty(LinkStack S)
{
    if (S == NULL)
        return 1;
    else
        return 0;
}
```
### 入栈（头插法）
```c
int Push(LinkStack* S, int e)
{
    StackNode* newNode = (StackNode*)malloc(sizeof(StackNode));
    if (newNode == NULL)
        return 0;
    newNode->data = e;
    newNode->next = *S;
    *S = newNode;
    return 1;
}
```
### 出栈（头删法）
```c
int Pop(LinkStack* S, int* e)
{
    if (StackEmpty(*S))
        return 0;
    StackNode* p = *S;
    *e = p->data;
    *S = p->next;
    free(p);
    return 1;
}
```
### 打印
```c
void PrintStack(LinkStack S)
{
    StackNode* p = S;
    while (p != NULL)
    {
        printf("%d ", p->data);
        p = p->next;
    }
    printf("\n");
}
```
### 测试环节
```c
int main()
{
    LinkStack S;
    int n;
    printf("初始化链栈\n");
    InitStack(&S);
    printf("初始化完成\n");
    printf("\n");
    printf("依次入栈1,2,3\n");
    Push(&S, 1);
    Push(&S, 2);
    Push(&S, 3);
    printf("入栈完成\n");
    printf("\n");
    printf("打印元素: ");
    PrintStack(S);
    printf("\n");
    printf("出栈\n");
    Pop(&S, &n);
    printf("弹出元素:%d\n", n);
    printf("\n");
    printf("出栈后链栈: ");
    PrintStack(S);

    return 0;
}
```
输出如下：
```html
初始化链栈
初始化完成

依次入栈1,2,3
入栈完成

打印元素: 3 2 1

出栈
弹出元素:3

出栈后链栈: 2 1
```

## 链队列

### 定义
```c
#include <stdio.h>
#include <stdlib.h>
typedef struct QNode
{
    int data;
    struct QNode* next;
} QNode;
typedef struct
{
    QNode* front;
    QNode* rear;
} LinkQueue;
```
### 初始化
```c
int InitQueue(LinkQueue* Q)
{
    Q->front = Q->rear = (QNode*)malloc(sizeof(QNode));
    if (Q->front == NULL)
        return 0;
    Q->front->next = NULL;
    return 1;
}
```
### 判空
```c
int QueueEmpty(LinkQueue* Q)
{
    if (Q->front == Q->rear)
        return 1;
    else
        return 0;
}
```
### 入队（尾插法）
```c
int EnQueue(LinkQueue* Q, int e)
{
    QNode* newNode = (QNode*)malloc(sizeof(QNode));
    if (newNode == NULL)
        return 0;
    newNode->data = e;
    newNode->next = NULL;
    Q->rear->next = newNode;
    Q->rear = newNode;
    return 1;
}
```
### 出队（头删法）
```c
int DeQueue(LinkQueue* Q, int* e)
{
    if (QueueEmpty(Q))
        return 0;
    QNode* p = Q->front->next;
    *e = p->data;
    Q->front->next = p->next;
    if (Q->rear == p)
        Q->rear = Q->front;
    free(p);
    return 1;
}
```

### 打印
```c
void PrintQueue(LinkQueue* Q)
{
    QNode* p = Q->front->next;
    while (p != NULL)
    {
        printf("%d ", p->data);
        p = p->next;
    }
    printf("\n");
}
```
### 销毁
```c
void DestroyQueue(LinkQueue* Q)
{
    while (Q->front != NULL)
    {
        Q->rear = Q->front->next;
        free(Q->front);
        Q->front = Q->rear;
    }
}
```
### 测试环节
```c
int main()
{
    LinkQueue Q;
    int e;
    printf("1. 初始化链队列\n");
    if (InitQueue(&Q) == 1)
        printf("队列初始化成功\n");
    else
        printf("队列初始化失败\n");

    printf("\n2. 测试空队列\n");
    if (QueueEmpty(&Q))
        printf("当前队列为空\n");
    else
        printf("当前队列不为空\n");

    printf("\n3. 入队测试：1 2 3\n");
    EnQueue(&Q, 1);
    EnQueue(&Q, 2);
    EnQueue(&Q, 3);
    printf("入队后队列元素(队头→队尾)：");
    PrintQueue(&Q);

    printf("\n4. 出队测试\n");
    if (DeQueue(&Q, &e) == 1)
        printf("成功出队元素：%d\n", e);
    else
        printf("出队失败，队列为空\n");
    printf("出队后队列元素：");
    PrintQueue(&Q);

    printf("\n5. 再入队测试：4\n");
    EnQueue(&Q, 4);
    printf("入队后队列元素：");
    PrintQueue(&Q);

    printf("\n6. 连续出队直到空\n");
    while (!QueueEmpty(&Q))
    {
        DeQueue(&Q, &e);
        printf("出队元素：%d\n", e);
    }
    printf("全部出队后队列元素：");
    PrintQueue(&Q);

    printf("\n7. 空队列出队测试\n");
    if (DeQueue(&Q, &e) == 0)
        printf("空队列出队失败\n");

    printf("\n8. 销毁队列\n");
    DestroyQueue(&Q);
    printf("队列已销毁\n");

    return 0;
}
```
输出如下：
```html
1. 初始化链队列
队列初始化成功

2. 测试空队列
当前队列为空

3. 入队测试：1 2 3
入队后队列元素(队头→队尾)：1 2 3

4. 出队测试
成功出队元素：1
出队后队列元素：2 3

5. 再入队测试：4
入队后队列元素：2 3 4

6. 连续出队直到空
出队元素：2
出队元素：3
出队元素：4
全部出队后队列元素：

7. 空队列出队测试
空队列出队失败

8. 销毁队列
队列已销毁

```

## 线性队列
### 定义
```c
#include <stdio.h>
#include <stdlib.h>
#define MAXSIZE 5
typedef struct
{
    int data[MAXSIZE]; // 存数据的数组
    int front;         // 队头下标
    int rear;          // 队尾下标
} SqQueue;
```
### 初始化
```c
void InitQueue(SqQueue* Q)
{
    Q->front = 0;
    Q->rear = 0;
}
```
### 判空
```
int QueueEmpty(SqQueue* Q)
{
    if (Q->front == Q->rear)
        return 1; // 空
    return 0;     // 非空
}
```
### 判满
```c
int QueueFull(SqQueue* Q)
{
    if (Q->rear == MAXSIZE)
        return 1; // 满
    return 0;     // 未满
}
```
### 入队
```c
int EnQueue(SqQueue* Q, int e)
{
    if (QueueFull(Q))
        return 0; // 队满，入队失败

    Q->data[Q->rear] = e; // 元素放到队尾空位
    Q->rear++;            // 队尾指针后移
    return 1;
}
```
### 出队
```c
int DeQueue(SqQueue* Q, int* e)
{
    if (QueueEmpty(Q))
        return 0; // 队空，出队失败

    *e = Q->data[Q->front]; // 取出队头元素
    Q->front++;             // 队头指针后移
    return 1;
}
```
### 打印
```c
void PrintQueue(SqQueue* Q)
{
    for (int i = Q->front; i < Q->rear; i++)
    {
        printf("%d ", Q->data[i]);
    }
    printf("\n");
}
```
### 测试环节
```c
int main()
{
    SqQueue Q;
    int e;

    printf("1. 初始化顺序队列\n");
    InitQueue(&Q);
    if (QueueEmpty(&Q))
        printf("队列初始化成功，当前为空\n");

    printf("\n2. 入队测试：1 2 3\n");
    EnQueue(&Q, 1);
    EnQueue(&Q, 2);
    EnQueue(&Q, 3);
    printf("入队后队列元素(队头→队尾)：");
    PrintQueue(&Q);
    printf("当前队头下标：%d，队尾下标：%d\n", Q.front, Q.rear);

    printf("\n3. 出队测试\n");
    if (DeQueue(&Q, &e))
        printf("成功出队元素：%d\n", e);
    printf("出队后队列元素：");
    PrintQueue(&Q);
    printf("当前队头下标：%d，队尾下标：%d\n", Q.front, Q.rear);

    printf("\n4. 再入队测试：4 5\n");
    EnQueue(&Q, 4);
    EnQueue(&Q, 5);
    printf("入队后队列元素：");
    PrintQueue(&Q);
    printf("当前队头下标：%d，队尾下标：%d\n", Q.front, Q.rear);

    printf("\n5. 演示假溢出问题\n");
    if (QueueFull(&Q))
        printf("队列判定为满，无法再入队\n");
    printf("但数组前%d个位置是空的！\n", Q.front);

    printf("\n6. 连续出队直到空\n");
    while (!QueueEmpty(&Q))
    {
        DeQueue(&Q, &e);
        printf("出队元素：%d\n", e);
    }
    printf("全部出队后队列元素：");
    PrintQueue(&Q);
    printf("当前队头下标：%d，队尾下标：%d\n", Q.front, Q.rear);

    return 0;
}
```
测试结果如下：
```html
1. 初始化顺序队列
队列初始化成功，当前为空

2. 入队测试：1 2 3
入队后队列元素(队头→队尾)：1 2 3
当前队头下标：0，队尾下标：3

3. 出队测试
成功出队元素：1
出队后队列元素：2 3
当前队头下标：1，队尾下标：3

4. 再入队测试：4 5
入队后队列元素：2 3 4 5
当前队头下标：1，队尾下标：5

5. 演示假溢出问题
队列判定为满，无法再入队
但数组前1个位置是空的！

6. 连续出队直到空
出队元素：2
出队元素：3
出队元素：4
出队元素：5
全部出队后队列元素：
当前队头下标：5，队尾下标：5
```
> [!CAUTION]
> &ensp;顺序队列致命缺陷：假溢出
```html
步骤4后状态：
下标：     0    1    2    3    4
数据：    [ ]  [2]  [3]  [4]  [5]
指针：       front=1              rear=5（超出范围）
```
此时物理空间没有用完，但程序却判定队列已满，无法再入队  
这就引出了循环队列，解决假溢出的问题
## 循环队列
把数组看成一个首尾相连的圆环，让指针走到头之后，可以绕回来继续使用前面的空位。 
   
取模运算(%)就是实现循环的方法：  
当 rear=4（数组最后一个下标），再往后走：(4+1)%5=0  
当 rear=0，再往后走：(0+1)%5=1  
指针永远在 0~4 之间循环，永远是有效的数组下标  
  
唯一的难点：如何区分队空和队满  
在循环队列中：  
队空和队满时都会出现：front == rear，无法用 front == rear 判断队空和队满。  
  
解决方案：  
牺牲一个数组位置，永远留一个空位不用。  
队空：front == rear  
队满：(rear + 1) % MAXSIZE == front  
也就是说，当队尾指针的下一个位置就是队头指针时，我们就认为队列满了。
| 操作         | 普通顺序队列      | 循环队列                  |
| ------------ | ----------------- | ------------------------- |
| 初始化       | front=rear=0      | 完全一样                  |
| 判空         | front == rear     | 完全一样                  |
| 判满         | rear == MAXSIZE   | (rear+1)%MAXSIZE == front |
| 入队         | rear++            | rear=(rear+1)%MAXSIZE     |
| 出队         | front++           | front=(front+1)%MAXSIZE   |
| 空间利用率   | 极低              | 接近 100%                 |
| 能否重复使用 | 不能    | 可以            |  

### 定义
```c
#include <stdio.h>
#include <stdlib.h>
#define MAXSIZE 5 // 实际能存的元素个数是 MAXSIZE-1=4 个
typedef struct
{
    int data[MAXSIZE];
    int front; // 队头，指向第一个有效元素
    int rear;  // 队尾，指向最后一个有效元素的下一个空位
} SqQueue;
```

### 初始化
```c
void InitQueue(SqQueue* Q)
{
    Q->front = 0;
    Q->rear = 0;
}
```
### 判空
```c
int QueueEmpty(SqQueue* Q)
{
    if (Q->front == Q->rear)
        return 1;
    return 0;
}
```
### 判满
```c
int QueueFull(SqQueue* Q)
{
    if ((Q->rear + 1) % MAXSIZE == Q->front)
        return 1;
    return 0;
}
```
### 入队
```c
int EnQueue(SqQueue* Q, int e)
{
    if (QueueFull(Q))
        return 0;

    Q->data[Q->rear] = e; 
    Q->rear = (Q->rear + 1) % MAXSIZE; // 只改了这一行
    return 1;
}
```
### 出队
```c
int DeQueue(SqQueue* Q, int* e)
{
    if (QueueEmpty(Q))
        return 0;

    *e = Q->data[Q->front]; 
    Q->front = (Q->front + 1) % MAXSIZE; // 只改了这一行
    return 1;
}
```
### 打印
```c
void PrintQueue(SqQueue* Q)
{
    // 从front开始，循环到rear结束
    for (int i = Q->front; i != Q->rear; i = (i + 1) % MAXSIZE)
    {
        printf("%d ", Q->data[i]);
    }
    printf("\n");
}
```
### 求队列长度
```c
int QueueLength(SqQueue* Q)
{
    return (Q->rear - Q->front + MAXSIZE) % MAXSIZE;
}
```

### 测试环节
```c
int main()
{
    SqQueue Q;
    int e;
    printf("1. 初始化循环队列\n");
    InitQueue(&Q);
    if (QueueEmpty(&Q))
        printf("队列初始化成功，当前为空，长度：%d\n", QueueLength(&Q));
    printf("\n2. 入队测试：1 2 3 4\n");
    EnQueue(&Q, 1);
    EnQueue(&Q, 2);
    EnQueue(&Q, 3);
    EnQueue(&Q, 4);
    printf("入队后队列元素：");
    PrintQueue(&Q);
    printf("当前队头下标：%d，队尾下标：%d，长度：%d\n", Q.front, Q.rear, QueueLength(&Q));
    printf("\n3. 测试队满\n");
    if (QueueFull(&Q))
        printf("队列已满，无法再入队\n");
    if (EnQueue(&Q, 5) == 0)
        printf("尝试入队元素5失败，队满判断正常\n");
    printf("\n4. 出队测试\n");
    if (DeQueue(&Q, &e))
        printf("成功出队元素：%d\n", e);
    printf("出队后队列元素：");
    PrintQueue(&Q);
    printf("当前队头下标：%d，队尾下标：%d，长度：%d\n", Q.front, Q.rear, QueueLength(&Q));
    printf("\n5.绕回前面空位入队（解决假溢出）\n");
    EnQueue(&Q, 5);
    printf("成功入队元素5！\n");
    printf("入队后队列元素：");
    PrintQueue(&Q);
    printf("当前队头下标：%d，队尾下标：%d，长度：%d\n", Q.front, Q.rear, QueueLength(&Q));
    printf("\n6. 连续出队直到空\n");
    while (!QueueEmpty(&Q))
    {
        DeQueue(&Q, &e);
        printf("出队元素：%d\n", e);
    }
    printf("全部出队后队列元素：");
    PrintQueue(&Q);
    printf("当前队头下标：%d，队尾下标：%d，长度：%d\n", Q.front, Q.rear, QueueLength(&Q));
    printf("\n7. 测试队列可以重复使用\n");
    EnQueue(&Q, 6);
    EnQueue(&Q, 7);
    printf("再次入队6、7成功，队列元素：");
    PrintQueue(&Q);

    return 0;
}
```
测试结果如下：
```html
1. 初始化循环队列
队列初始化成功，当前为空，长度：0

2. 入队测试：1 2 3 4
入队后队列元素：1 2 3 4
当前队头下标：0，队尾下标：4，长度：4

3. 测试队满
队列已满，无法再入队
尝试入队元素5失败，队满判断正常

4. 出队测试
成功出队元素：1
出队后队列元素：2 3 4
当前队头下标：1，队尾下标：4，长度：3

5.绕回前面空位入队（解决假溢出）
成功入队元素5！
入队后队列元素：2 3 4 5
当前队头下标：1，队尾下标：0，长度：4

6. 连续出队直到空
出队元素：2
出队元素：3
出队元素：4
出队元素：5
全部出队后队列元素：
当前队头下标：0，队尾下标：0，长度：0

7. 测试队列可以重复使用
再次入队6、7成功，队列元素：6 7
```
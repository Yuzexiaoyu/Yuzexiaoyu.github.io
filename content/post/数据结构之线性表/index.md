---
title: 数据结构之线性表
date: 2026-03-31
lastmod: 2026-05-16
weight: 1
description: 顺序表和链表的实现与运用。
image: lighthouse.jpg
comments: true
---
线性表是数据结构的第一块基石，所有复杂数据结构都建立在它的基础之上。
## 顺序表
### 定义
首先，我们要先定义顺序表的结构
```c++
#include<stdio.h>
#include<stdlib.h>
typedef int SLDataType;
// 这里用 typedef 把 int 取了一个别名 SLDataType。
// 这样如果将来想把顺序表改成保存其他类型的数据（比如 float），只需要修改这一行就可以
typedef struct SeqList
{
	SLDataType* arr;  // arr指针指向整个连续内存空间的起始地址，也就是整个数组的所有元素
	int size;  // 当前已有元素的数量
	int capacity;  // 当前数组能够容纳的最大元素个数
}SL;
```
### 初始化
当然，只定义了顺序表是没有用的，我们还需要初始化，把顺序表变成能用的空表
```c
void SLInit(SL* ps)  //ps是指向整个顺序表结构体的指针，上面的arr是结构体里面存数据的数组的指针
{
	ps->arr = NULL;  // 把 arr 设为 NULL，表示当前没有在堆上分配数组内存
	ps->size = 0;  // 把 size 设为 0，表示当前顺序表中没有有效元素
	ps->capacity = 0;  // 把 capacity 设为 0，表示当前没有为元素准备任何容量
}
```
### 扩容
初始化后，size和capacity都为0，我们可以定义SLCheckCapacity函数来检查并扩容顺序表
```c
void SLCheckCapacity(SL* ps)
{
    if (ps->size == ps->capacity)  // 检查：元素数量 == 容量 → 满了，需要扩容
    {
        int newCapacity = ps->capacity == 0 ? 4 : ps->capacity * 2;  
	// 计算新容量：空表给4个空间，非空表扩容2倍(这是固定写法，记死就行)
	// 三目运算符：变量 = 条件?条件成立取这个数:条件不成立取这个数;
        ps->arr = (SLDataType*)realloc(ps->arr, newCapacity * sizeof(SLDataType));  
	// 调用realloc扩容/开辟内存
        ps->capacity = newCapacity;  // 更新顺序表的容量
    }
}
 // 扩容不会一直生效，要插入先调用SLCheckCapacity函数检查容量是否足够
```

### 销毁 
释放顺序表占用的内存，把顺序表恢复成空的初始状态，防止内存浪费
```c
void SLDestroy(SL* ps) 
{
	free(ps->arr);  // 释放动态开辟的数组内存
	ps->arr = NULL;  // 指针置空
	ps->size = 0;  // 元素个数归零
	ps->capacity = 0; // 容量归零
}
```
### 插入删除
#### 尾插 
在顺序表的尾部用SLPushBack函数插入一个元素 x
```c
void SLPushBack(SL* ps, SLDataType x)  // SL* ps：要操作的顺序表指针，x：插入的数字
{
	SLCheckCapacity(ps);  // 先检查容量，如过容量不够会自动扩容
	ps->arr[ps->size] = x;  // 找到顺序表数组里最后一个空位置，把新数据 x 放进去
	ps->size++;  // 更新元素数量，size 加 1
}
```
#### 尾删
在顺序表的尾部用SLPopBack函数删除一个元素
```c
void SLPopBack(SL* ps)
{
	if (ps->size == 0)
	{
		printf("顺序表为空，无元素可删除！\n");
		return;
	}  // 空表判断
	ps->size--;  // 只需要把元素个数减1
}
```

#### 指定位置插入
定义SLInsert函数在顺序表的指定位置插入，尾插 / 头插都是它的特例
```c
void SLInsert(SL* ps, int pos, SLDataType x)
// SL* ps:要操作的顺序表指针，pos:插入位置，x:插入数据
{
	if (pos < 0 || pos > ps->size) {
		printf("错误：插入位置非法，有效范围：0~%d\n",ps->size);  // 判断位置是否合法
		return;
	}
	SLCheckCapacity(ps);  // 检查容量，必要时自动扩容
	int end = ps->size;
	while (end > pos)
	{
		ps->arr[end] = ps->arr[end - 1];  // 把前一个元素，赋值给后一个位置
		end--;  // 继续循环挪动前面的元素
	}
	ps->arr[pos] = x;  // 插入数据
	ps->size++;  // 更新元素数量
}
```

#### 指定位置删除 
定义SLDelete函数在顺序表的指定位置删除，尾删 / 头删都是它的特例
```c
void SLDelete(SL* ps, int pos) 
// SL* ps:要操作的顺序表指针，pos:删除位置
{
	if (pos < 0 || pos >= ps->size) {
		printf("错误：删除位置非法，有效范围：0~%d\n",ps->size-1);  // 判断位置是否合法
		return;
	}
	int start = pos;
	while (start < ps->size - 1)
	{
		ps->arr[start] = ps->arr[start + 1];  // 把后一个元素，赋值给前一个位置
		start++;  // 继续循环挪动后面的元素
	}
	ps->size--;  // 更新元素数量
}
```

### 打印 
定义SLPrint函数打印顺序表中的元素
```c
void SLPrint(SL* ps) 
{
	for (int i = 0; i < ps->size; i++) {
		printf("%d ", ps->arr[i]);
	}
	printf("\n");
}
```
### 查找
定义SLFind函数在顺序表中查找元素 x，返回元素所在位置的索引，如果没有找到返回 -1
```c
int SLFind(SL* ps, SLDataType x)  // x：要查找的元素
{
	
	for (int i = 0;i < ps->size; i++) 
	{
		if (ps->arr[i] == x)
		{
			return i;  // 找到直接返回下标i
		}
	}
	return -1;  // 没有找到返回-1
}
```

### 修改 
定义SLModify函数在顺序表中修改指定位置的元素为 x
```c
void SLModify(SL* ps, int pos, SLDataType x)  // pos：要修改的元素下标,x：要改成的新数据
{
	if (pos < 0 || pos >= ps->size) 
	{
		printf("错误：修改位置非法，有效范围：0~%d\n",ps->size - 1);
		return;
	}
	ps->arr[pos] = x;
}
```
### 测试环节
```c
int main() {
	SL list;
	SLInit(&list);

  printf("基础操作测试:\n");
	SLPushBack(&list, 1);
	SLPushBack(&list, 2);
	SLPushBack(&list, 3);
	printf("尾插1,2,3: ");
	SLPrint(&list);

	SLInsert(&list, 1, 10);
	printf("在下标1插入10: ");
	SLPrint(&list);

	SLDelete(&list, 2);
	printf("删除下标2: ");
	SLPrint(&list);

	SLPopBack(&list);
	printf("尾删: ");
	SLPrint(&list);

	printf("\n查找与修改测试:\n");
	printf("查找10的下标: %d\n", SLFind(&list, 10));
	SLModify(&list, 0, 99);
	printf("把下标0修改为99: ");
	SLPrint(&list);

	printf("\n非法操作测试:\n");
	SLInsert(&list, 10, 88);
	SLDelete(&list, -1);
	SLModify(&list, 10, 100);

	printf("\n清空测试(连续尾删):\n");
	while (list.size > 0)
	{
		SLPopBack(&list);
		SLPrint(&list);
	}
	SLPopBack(&list); // 再删一次，触发空表提示

	SLDestroy(&list);
	return 0;
}
```
输出如下：
```html
基础操作测试:
尾插1,2,3: 1 2 3
在下标1插入10: 1 10 2 3
删除下标2: 1 10 3
尾删: 1 10

查找与修改测试:
查找10的下标: 1
把下标0修改为99: 99 10

非法操作测试:
错误：插入位置非法，有效范围：0~2
错误：删除位置非法，有效范围：0~1
错误：修改位置非法，有效范围：0~1

清空测试(连续尾删):
99

顺序表为空，无元素可删除！
```

## 链表
### 定义
首先，我们要先定义链表的结构
```c++
#include<stdio.h>
#include<stdlib.h>
typedef struct LNode
{
	int data;
	struct LNode* next;  // 存下一个节点地址
}LNode;
typedef struct LNode* LinkList;  // 起别名LNode* -> LinkList
```

### 初始化
初始化，把链表变成能用的空表
```c
void InitList(LinkList* L)  // 传入二级指针，指向头结点地址
{
	*L = (LinkList)malloc(sizeof(struct LNode));  // 创建头结点
	(*L)->next = NULL;  // ()用于改变优先级
}
```

### 取值
```c
int GetElem(LinkList L, int i, int* e)  // 获取第i个元素的值，存入e中
{
	LNode* p = L->next;  // p指向第一个节点
	int j = 1;  // 计数器
	while (p != NULL && j < i)
	{
		p = p->next;  // 移动到下一个节点
		j++;
	}
	if (p == NULL || j > i)
		return 0;
	*e = p->data;  // 将第i个节点的值存入e中
	return 1;
}
```

### 查找
```c
LNode* LocateElem(LinkList L, int e)  // 查找值为e的节点
{
	LNode* p = L->next;  // p指向第一个节点
	while (p != NULL && p->data != e)
		p = p->next;  // 移动到下一个节点
	return p;  // 返回找到的节点地址，未找到返回NULL
}
```

### 插入
```c
int ListInsert(LinkList* L, int i, int e)  // 在第i个位置插入值为e的节点
{
	LNode* p = *L;  // p指向头结点
	int j = 0;  // 计数器
	while (p != NULL && j < i - 1)
	{
		p = p->next;  // 移动到下一个节点
		j++;
	}
	if (p == NULL || j > i - 1)
		return 0;
	LNode* s = (LNode*)malloc(sizeof(LNode));  // 创建新节点
	if (s == NULL)
		return 0;
	s->data = e;  // 设置新节点的值
	s->next = p->next;  // 新节点指向当前节点的下一个节点
	p->next = s;  // 当前节点指向新节点
	return 1;  // 插入成功
}
```

### 删除
```c
int ListDelete(LinkList* L, int i, int* e)  // 删除第i个节点，并将其值存入e中
{
	LNode* p = *L;  // p指向头结点
	int j = 0;  // 计数器
	while (p->next != NULL && j < i - 1)
	{
		p = p->next;  // 移动到下一个节点
		j++;
	}
	if (p->next == NULL || j > i - 1)
		return 0;
	LNode* q = p->next;  // q指向要删除的节点
	*e = q->data;  // 将要删除节点的值存入e中
	p->next = q->next;  // 当前节点指向要删除节点的下一个节点
	free(q);  // 释放要删除的节点
	return 1;  // 删除成功
}
```

### 尾插
```c
int ListInsertTail(LinkList* L, int n)
{
	LinkList p = *L;
	while (p->next != NULL)
	{
		p = p->next;
	}
	LinkList s = (LinkList)malloc(sizeof(struct LNode));
	if (s == NULL)
		return 0;
	s->data = n;
	s->next = NULL;
	p->next = s;
	return 1;
}
```

### 打印
```c
void PrintList(LinkList L)
{
	LinkList p = L->next;  // p指向第一个节点
	while (p != NULL)
	{
		printf("%d ", p->data);  // 打印当前节点的值
		p = p->next;  // 移动到下一个节点
	}
	printf("\n");
}
```

### 清空
```c
void ClearList(LinkList* L)
{
	LNode* p, * q;
	p = (*L)->next;  // p指向第一个节点
	while (p != NULL)
	{
		q = p->next;  // q指向下一个节点
		free(p);  // 释放当前节点
		p = q;  // p指向下一个节点
	}
	(*L)->next = NULL;  // 头结点指向NULL，表示链表已清空
}
```

### 销毁
```c
void DestroyList(LinkList* L)
{
	ClearList(L);  // 先清空链表
	free(*L);  // 释放头结点
	*L = NULL;  // 将头结点指针置为NULL，表示链表已销毁
}
```

### 测试环节
```c
int main()
{
	LinkList L;
	int e;
	LNode* p;
	printf("1.初始化链表:\n");
	InitList(&L);
	printf("初始化完成\n\n");
	printf("2.尾插元素:10,20,30\n");
		ListInsertTail(&L, 10);
		ListInsertTail(&L, 20);
		ListInsertTail(&L, 30);
	printf("当前链表：");
	PrintList(L);
	printf("\n");
	printf("3.按位插入：第2个位置插入25\n");
	ListInsert(&L, 2, 25);
	printf("当前链表：");
	PrintList(L);
	printf("\n");
	printf("4.获取第3个元素的值:\n");
		if (GetElem(L, 3, &e))
			printf("第3个元素的值为: %d\n", e);
		else
			printf("获取失败\n");
		printf("\n");
	printf("5.寻找值为25的位置:\n");
		p = LocateElem(L, 25);
		if (p != NULL)
			printf("25地址为: %p\n", p);
		else
			printf("未找到\n");
		printf("\n");
	printf("6.删除第4个元素:\n");
		if (ListDelete(&L, 4, &e))
			printf("删除成功，删除的元素值为: %d\n", e);
		else
			printf("删除失败\n");
		printf("\n");
	printf("当前链表：");
	PrintList(L);
	printf("\n");
	printf("7.清空链表:\n"); 
	ClearList(&L);
	printf("清空后链表：");
	PrintList(L);
	printf("\n");
	printf("8.销毁链表!\n");
	DestroyList(&L);
	if (L == NULL)
		printf("链表已销毁!\n");
	return 0;
}
```
输出如下：
```html
1.初始化链表:
初始化完成

2.尾插元素:10,20,30
当前链表：10 20 30

3.按位插入：第2个位置插入25
当前链表：10 25 20 30

4.获取第3个元素的值:
第3个元素的值为: 20

5.寻找值为25的位置:
25地址为: 00000000004C0AD0

6.删除第4个元素:
删除成功，删除的元素值为: 30

当前链表：10 25 20

7.清空链表:
清空后链表：

8.销毁链表!
链表已销毁!
```


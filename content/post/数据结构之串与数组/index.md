---
title: 数据结构之串与数组
date: 2026-06-15
lastmod: 2026-06-18
weight: 3
description: 串与数组的实现与运用。
image: milkyway.webp
comments: true
---
## 串  
串或字符串是由零个或多个字符组成的有限序列，一般记为s="a<sub>1</sub> a<sub>2</sub> ··· a<sub>n</sub>"。  
零个字符的串称为空串，其长度为0。  
串中任意个连续的字符组成的子序列称为该串的子串，子串在主串中的位置则以子串的第一个字符在主串中的位置来表示。  
一个或多个空格组成的串“ ”称为空格串，我们用符号∅来表示空串  
### 串的存储结构  
#### 定长顺序存储结构
```c
#define MAXLEN 255
typedef struct
{
char ch[MAXLEN + 1];  //  存储串的一堆数组
int length;  //   串的当前长度
}SString;
```
串的操作是以串的整体形式参与的，把串变量设定成固定大小不合理  
我们最好根据实际需要，动态分配和释放数组空间，这就引出了堆式存储结构  
#### 堆式顺序存储结构
在c语言中，存在“堆”自由存储区，，可以为新产生的串动态分配实际所需的存储空间  
分配成功则返回一个指向起始地址的指针作为串的基址
```c
typedef struct
{
char *ch;
int length;
}HString;
```
#### 链式存储结构
顺序串的插入删除不方便，采用链式存储结构存储的串被称为链串  
用链表存储串值时，存在“节点大小”问题，即每个节点可以存在一个或多个字符  
链表最后一个节点不一定全被串值占满，通常补上“#”  
```c
# define CHUNKSIZE 80  //  可自定义的块大小
typedef struct Chunk
{
char ch[CHUNKSIZE];
struct Chunk* next;
}Chunk;
typedef struct
{
Chunk* head,* tail;
int length;
}LString;
```
链式存储结构对某些串操作有一定方便之处，但总体来说，不如顺序存储结构灵活  
所以我们一般用定长顺序存储结构
### 串的操作
#### 初始化（将原生字符串写入串）
```c
void InitString(SString* S, char* str)
{
	if (str == NULL)
	{
		S->length = 0;
		S->ch[1] = '\0';
		return;
	}

	S->length = strlen(str);
	if (S->length > MAXLEN - 2)
	{
		S->length = MAXLEN - 2;
	}
	for (int i = 1; i <= S->length; i++)
	{
		S->ch[i] = str[i - 1];
	}
	S->ch[S->length + 1] = '\0';
}
```
#### 求串长
```c
int StrLength(SString S)
{
	return S.length;
}
```
#### 串复制
```c
int StrCopy(SString* T, SString S)  // 将串S复制到T
{
	for (int i = 1; i <= S.length; i++)
	{
		T->ch[i] = S.ch[i];
	}
	T->length = S.length;
	T->ch[T->length + 1] = '\0';
	return 1;
}
```
#### 求子串
用T返回串S的第pos个字符起，长度为len的子串
```c
int SubString(SString* T, SString S, int pos, int len)
{
	if (pos < 1 || pos > S.length || len < 0 || pos + len - 1 > S.length)
	{
		return 0;
	}
	for (int i = 1; i <= len; i++)
	{
		T->ch[i] = S.ch[pos - 1 + i];
	}
	T->length = len;
	T->ch[T->length + 1] = '\0';
	return 1;
}
```
#### 串打印
```c
void PrintString(SString S)
{
	printf("%s\n", S.ch + 1);
}
```
#### 串比较
```c
int StrCompare(SString S, SString T)
{
	for (int i = 1; i <= S.length && i <= T.length; i++)
	{
		if (S.ch[i] != T.ch[i])
		{
			return S.ch[i] - T.ch[i];
		}
	}
	return S.length - T.length;
}
```
返回值：若S>T，则返回值>0；若S=T，则返回值=0；若S<T，则返回值<0
从左往右比：遇到第一个不同的字符，ASCII码值大的串较大；前面字符都相同，长的串较大
"cat"和"car"  t>r  "cat"大
"z"和"ab"  z>a  "z"大
"abc"和"abcd"  abc相同，长的串较大  "abcd"大
串比较用于字符串排列，文本范围查找等用途
#### 串连接
```c
int StrConcat(SString* T, SString S1, SString S2)  // 拼接S1和S2,存入T
{
	if (S1.length + S2.length > MAXLEN - 2)
	{
		return 0;
	}
	for (int i = 1; i <= S1.length; i++)
	{
		T->ch[i] = S1.ch[i];
	}
	for (int j = 1; j <= S2.length; j++)
	{
		T->ch[S1.length + j] = S2.ch[j];
	}
	T->length = S1.length + S2.length;
	T->ch[T->length + 1] = '\0';
	return 1;
}
```
### 串的匹配模式算法
找出子串（称为模式串）在主串（称为正文串）中的位置  
应用广泛，比如在搜索引擎、拼写检查等应用中
#### BF算法
也称串匹配的朴素算法，通过穷举来匹配，可以指定起始位置pos  
从起始位置开始向后比对模式串，比对失败则模式串向后移重新比对
```c
int BF(SString S, SString T, int pos)
{
	int i = pos, j = 1;
	while (i <= S.length && j <= T.length)
	{
		if (S.ch[i] == T.ch[j])
		{
			i++; j++;
		}
		else
		{
			i = i - j + 2;
			j = 1;
		}
	}
	if (j > T.length)
		return i - T.length; // 匹配成功起始位置
	return 0;
}
```
#### KMP算法
复用已匹配的字符信息，若其中有字符串与模式串头部匹配，模式串指针直接跳至合适位置  
当其无法与模式串头部匹配，跳过以匹配这一段所有字符  
next数组为此算法核心  
nextval是next的优化升级版  
| 序号 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| ---- | - | - | - | - | - | - | - | - |
| 模式串 | a | b | a | b | c | a | a | b |
| next | 0 | 1 | 1 | 2 | 3 | 1 | 2 | 2 |
| nextval | 0 | 1 | 0 | 1 | 3 | 0 | 2 | 1 |

获取模式串T的next数组：
```c
void GetNext(SString T, int next[])  
{
	int i = 1, j = 0; next[1] = 0;
	while (i < T.length)
	{
		if (j == 0 || T.ch[i] == T.ch[j])
		{
			++i; ++j;
			next[i] = j;
		}
		else
		{
			j = next[j];
		}
	}
}
```
获取模式串T的nextval数组：
```c
void GetNextVal(SString T, int nextval[])  
{
	int i = 1; nextval[1] = 0; int j = 0;
	while (i < T.length)
	{
		if (j == 0 || T.ch[i] == T.ch[j])
		{
			++i; ++j;
			if (T.ch[i] != T.ch[j])
				nextval[i] = j;
			else
				nextval[i] = nextval[j];
		}
		else
		{
			j = nextval[j];
		}
	}
}
```
算法使用：
```c
int KMP(SString S, SString T, int pos)
{
	int i = pos,j = 1; 
	while(i <= S.length && j <= T.length)
	{
		if (j == 0 || S.ch[i] == T.ch[j])
		{
			++i; ++j;
		}
		else
		{
			j = next[j]; // 若要使用nextval数组，则j = nextval[j]，
		}
	}
	if (j > T.length)
		return i - T.length;
	return 0;
}
```
### 串测试环节
在开头引入全局变量和存储结构  
```c
#include <stdio.h>
#include <string.h>
#define MAXLEN 255
int next[MAXLEN], nextval[MAXLEN];

typedef struct {
	char ch[MAXLEN];
	int length;
} SString;
```
测试主程序：  
```c
int main()
{
	SString	S, T, T1, T2, T3;

	int pos;
	printf("一、串基本操作测试：\n");
	InitString(&S, "abcdefg");
	printf("打印主串S：");
	PrintString(S);
	printf("复制串S至串T：\n");
	StrCopy(&T, S);
	printf("打印串T：");
	PrintString(T);
	printf("求S第2个字符起，长度为3的子串，放入T1：\n");
	SubString(&T1, S, 2, 3);
	printf("串T1：");
	PrintString(T1);
	printf("给T2，T3分别赋值abc,abd：\n");
	InitString(&T2, "abc");
	InitString(&T3, "abd");
	printf("串T2：");
	PrintString(T2);
	printf("串T3：");
	PrintString(T3);
	printf("比较串T2和T3：");
	printf("结果：%d\n", StrCompare(T2, T3));
	printf("链接T2,T3，放入T：\n");
	StrConcat(&T, T2, T3);
	printf("连接后的串T：");
	PrintString(T);
	printf("\n");
	printf("二、匹配算法测试：\n");
	printf("1.BF算法测试：\n");
	printf("给S和T赋新值\n");
	InitString(&S, "ababcabcacbab");
	InitString(&T, "abcac");
	printf("主串S：");
	PrintString(S);
	printf("模式串T：");
	PrintString(T);
	printf("进行BF匹配：\n");
	pos = BF(S, T, 1);
	printf("BF匹配结果：模式串在主串第%d个位置出现\n", pos);


	printf("2.KMP算法测试：\n");
	printf("赋值ababc给T：\n");
	InitString(&T, "ababc");
	printf("模式串T：");
	PrintString(T);
	printf("求next数组：");
	GetNext(T, next);
	for (int i = 1; i <= T.length; i++)
	{
		printf("%d ", next[i]);
	}
	printf("\n");
	printf("求nextval数组：");
	GetNextVal(T, nextval);
	for (int i = 1; i <= T.length; i++)
	{
		printf("%d ", nextval[i]);
	}
	printf("\n");
	printf("赋值abababc给S：\n");
	InitString(&S, "abababc");
	printf("主串S：");
	PrintString(S);
	pos = KMP(S, T, 1);
	printf("KMP匹配结果：模式串在主串第%d个位置出现\n", pos);
}
```
输出结果如下：
```html
一、串基本操作测试：
打印主串S：abcdefg
复制串S至串T：
打印串T：abcdefg
求S第2个字符起，长度为3的子串，放入T1：
串T1：bcd
给T2，T3分别赋值abc,abd：
串T2：abc
串T3：abd
比较串T2和T3：结果：-1
链接T2,T3，放入T：
连接后的串T：abcabd

二、匹配算法测试：
1.BF算法测试：
给S和T赋新值
主串S：ababcabcacbab
模式串T：abcac
进行BF匹配：
BF匹配结果：模式串在主串第6个位置出现
2.KMP算法测试：
赋值ababc给T：
模式串T：ababc
求next数组：0 1 1 2 3
求nextval数组：0 1 0 1 3
赋值abababc给S：
主串S：abababc
KMP匹配结果：模式串在主串第3个位置出现
```
## 数组
数组为n个相同类型数据元素组成的有限序列，每个元素由唯一的下标确认位置  
* 随机访问快：下标直接定位元素
* 存储密度高：连续内存
* 插入删除低效：中间插入/删除需要移动大量元素
### 数组地址
存储规则：按下标小->大依次存储  
地址公式：元素占a字节，首地址LOC(a[0])  
LOC(a[i])  = LOC(a[0])  + i * a  
例：a[10]首地址a[0]为1000，每个元素占4字节，则a[5]地址=1000+5x4=1020  
### 数组存储
二维数组有两种存储顺序，列优先和行优先  
C语言默认行优先，先存完第一行，再存第二行  
数组a[m][n](m行n列，下标从0开始)  
LOC(a[i][j]) = LOC(a[0][0]) + (i*n+j)*L (L:单个元素占用内存字节数)  
列优先，先存完第一列，再存第二列：
LOC(a[i][j]) = LOC(a[0][0]) + (j*m+i)*L  
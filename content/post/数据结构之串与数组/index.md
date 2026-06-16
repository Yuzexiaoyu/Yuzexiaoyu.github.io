---
title: 数据结构之串与数组
date: 2026-06-15
lastmod: 2026-06-15
weight: 3
description: 串与数组的实现与运用。
image: milkyway.jpg
comments: true
---
## 串  
串或字符串是由零个或多个字符组成的有限序列，一般记为s="a<sub>1</sub> a<sub>2</sub> ··· a<sub>n</sub>"  。
零个字符的串称为空串，其长度为0。  
串中任意个连续的字符组成的子序列称为该串的子串，子串在主串中的位置则以子串的第一个字符在主串中的位置来表示。
一个或多个空格组成的串“ ”称为空格串，我们用符号∅来表示空串  
### 串的存储结构  
#### 定长顺序存储结构
```html
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
```html
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
```html
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
### 初始化








### 串的匹配模式算法
找出子串（称为模式串）在主串（称为正文串）中的位置  
应用广泛，比如在搜索引擎、拼写检查等应用中
#### BF算法
也称串匹配的朴素算法，通过穷举来匹配
#### KMP算法

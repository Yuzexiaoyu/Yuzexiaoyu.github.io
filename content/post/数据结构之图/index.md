---
title: 数据结构之图
date: 2026-06-22
lastmod: 2026-06-22
weight: 5
description: 图的实现与运用。
image: lights.webp
comments: true
---
图结构中，结点之间的关系可以是任意的，图中任意两个数据元素都可能相关  
## 图的定义与数组
图G由两个集合组成，记为：G=(V，E)  
V：顶点的有限非空集合  
E：边的集合  
基本术语：
* 子图：图的一部分称为子图，是从原图中“抠”出来的一部分
* 无向图：边是“无序对”，没有方向  
* 有向图：边是“有序对”，有方向  
* 完全图：任意两个顶点之间都有边相连  
  * 无向完全图：n 个顶点，边数为n(n-1)/2
  * 有向完全图：n 个顶点，边数为n(n-1)
* 稀疏图 vs 稠密图：边很少的叫稀疏图，边很多的叫稠密图  
* 权和网：图中每条边可以标上具有某种含义的数值，该数值称为该边上的权，这种带权的图称为网  
* 邻接：
  * 无向图：边（a,b），则a和b互为邻接点  
  * 无向图：弧<a,b>，则a邻接到b，b邻接自a  
* 度：
  * 无向图：度就是该结点连了多少条边，无向图中，所有顶点的度之和 = 边数的 2 倍  
  * 有向图：分为入度（指向结点的箭头数）和出度（指出结点的箭头数），度 = 入度 + 出度  
* 路径：从顶点a出发，沿着边到达b，这个路线就是路径，有向图的路径是有向的  
* 路径长度：路径上经过的边数（或者边上权值的总和）
* 回路或环：出发点和终点是同一个顶点的路径
* 简单路径/回路/环：结点不重复出现的路径/回路/环
* 连通：无向图中，a与b之间有路径，则a和b是连通的
* 连通图：无向图中，任意两个顶点都连通的图
* 连通分量：也就是极大连通子图，是一张图中的极大连通子图，一张图未必只有一个极大连通子图，可以有多个
* 强连通图：有向图中，任意一对顶点a和b，从a到b和从b到a都有路径
* 强连通分量：也就是有向图的极大强连通子图，一张图未必只有一个极大强连通子图，可以有多个  
* 生成树：能连通所有的顶点，而不产生回路，并且只有n-1条边的子图  
## 图的存储结构 
### 邻接矩阵
原理：用一个二维数组来表示图  
假设图有 n 个顶点，我们就开一个 n*n 的二维数组 A[n][n]  
* 行和列的索引分别代表顶点
* 如果顶点a和顶点b之间有边，那么 A[a][b] = 1（如果是带权图，就填权值）
* 如果没有边，A[a][b] = 0（带权图通常填∞，表示无穷大）  

例：假设一个无向图有 A、B、C 三个点，A和B相连，B和C相连 
```html       
    A  B  C
A [ 0, 1, 0 ]
B [ 1, 0, 1 ]
C [ 0, 1, 0 ]
```
特点
* 无向图的邻接矩阵一定是一个对称矩阵，有时可以用矩阵压缩只存上三角或者下三角
* 有向图的矩阵不一定对称  

优缺点
* 优点：非常直观，直接用A[i][j]判断两个点之间有没有边，便于计算顶点的度
* 缺点：浪费空间，不便于增加和删除结点，不利于统计边的数目

存储结构体：
```c
# define MAXInt 32767
# define MVNum 100  //  最大顶点数
typedef char VerTexType;  //  顶点
typedef int ArcType;  //  边
typedef struct 
{
	VerTexType vexs[MVNum];
	ArcType arcs[MVNum][MVNum];
	int vexnum, arcnum;
}AMGraph;
```
创建无向网：
```c
void CreateUDN(AMGraph* G) {
    int i, j, k;
    int v1, v2, w;

    printf("请输入总顶点数和总边数：");
    scanf("%d %d", &G->vexnum, &G->arcnum);

    printf("请输入 %d 个顶点的值(如 A B C)：\n", G->vexnum);
    for (i = 0; i < G->vexnum; ++i) {
        scanf(" %c", &G->vexs[i]); 
    }

    for (i = 0; i < G->vexnum; ++i) {
        for (j = 0; j < G->vexnum; ++j) {
            G->arcs[i][j] = MAXInt;
        }
    }

    printf("请输入 %d 条边的起点下标、终点下标和权值(如 0 1 5)：\n", G->arcnum);
    for (k = 0; k < G->arcnum; ++k) {
        scanf("%d %d %d", &v1, &v2, &w);

        G->arcs[v1][v2] = w;
        G->arcs[v2][v1] = G->arcs[v1][v2]; 
    }
}
```
测试环节：
```
void PrintAMGraph(AMGraph* G) {
    printf("    ");
    for (int i = 0; i < G->vexnum; ++i) {
        printf("%4c", G->vexs[i]);
    }
    printf("\n");
    for (int i = 0; i < G->vexnum; ++i) {
        printf("%4c", G->vexs[i]); 
        for (int j = 0; j < G->vexnum; ++j) {
            if (G->arcs[i][j] == MAXInt) {
                printf("   ∞"); 
            }
            else {
                printf("%4d", G->arcs[i][j]);
            }
        }
        printf("\n");
    }
}

int main() {
    AMGraph G;
    CreateUDN(&G);
    PrintAMGraph(&G);
    return 0;
}
```
测试结果如下：
```html
请输入总顶点数和总边数：4 3
请输入 4 个顶点的值(如 A B C)：
A B C D
请输入 3 条边的起点下标、终点下标和权值(如 0 1 5)：
0 1 5
1 2 10
1 3 15
       A   B   C   D
   A   ∞   5   ∞   ∞
   B   5   ∞  10  15
   C   ∞  10   ∞   ∞
   D   ∞  15   ∞   ∞
```
### 邻接表